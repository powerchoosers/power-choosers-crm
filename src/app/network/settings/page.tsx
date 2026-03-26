'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Bell, Shield, Palette, Database, Trash2, Plus, Phone, User as UserIcon, Lock, Mail, RefreshCw, Zap, Brain, Radio, Activity, CheckCircle, AlertCircle, Fingerprint, Network, Globe, ExternalLink, Cpu } from 'lucide-react'
import { useSyncStore } from '@/store/syncStore'
import { useZohoSync } from '@/hooks/useZohoSync'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '@/store/uiStore'

export default function SettingsPage() {
  const { user, profile, role, refreshProfile } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [bio, setBio] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [website, setWebsite] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [localEmail, setLocalEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [twilioNumbers, setTwilioNumbers] = useState<Array<{ name: string; number: string }>>([])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string | null>(null)
  const [bridgeToMobile, setBridgeToMobile] = useState(false)
  const [newNumber, setNewNumber] = useState('')
  const [newNumberName, setNewNumberName] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // UI Store Sound Settings
  const { 
    soundEnabled, setSoundEnabled,
    soundIncomingEnabled, setSoundIncomingEnabled,
    soundActionEnabled, setSoundActionEnabled,
    soundNavigationEnabled, setSoundNavigationEnabled,
    soundCriticalEnabled, setSoundCriticalEnabled
  } = useUIStore()

  // Sync Store & Hook
  const { lastSyncTime, syncCount, isSyncing: storeSyncing } = useSyncStore()
  const { performSync, isSyncing: hookSyncing } = useZohoSync()
  const isSyncing = storeSyncing || hookSyncing

  // Diagnostics State
  const [diagData, setDiagData] = useState<any>(null)
  const [isCheckingHealth, setIsCheckingHealth] = useState(false)

  const runDiagnostics = async () => {
    setIsCheckingHealth(true)
    try {
      const res = await fetch('/api/debug/health')
      const data = await res.json()
      setDiagData(data)
      toast.success('Matrix Diagnostic Complete')
    } catch (err) {
      toast.error('Diagnostic Fault Detected')
    } finally {
      setIsCheckingHealth(false)
    }
  }

  useEffect(() => {
    if (diagData === null) runDiagnostics()
  }, [])

  // Email Connections
  const [connections, setConnections] = useState<any[]>([])
  const [isConnecting, setIsConnecting] = useState(false)

  const fetchConnections = async () => {
    if (!user) return
    const userId = user.id
    const primaryEmail = user.email ? user.email.toLowerCase() : ''
    const { data } = await supabase.from('zoho_connections')
      .select('*')
      .eq('user_id', userId)

    if (data) {
      // Filter out the primary email to avoid duplication in the UI
      const secondaryConnections = data.filter(conn =>
        conn.email?.toLowerCase() !== primaryEmail
      )
      setConnections(secondaryConnections)
    }
  }

  useEffect(() => {
    fetchConnections()
  }, [user])

  // Handle OAuth Callback
  useEffect(() => {
    const action = searchParams?.get('action')
    const code = searchParams?.get('code')

    if (action === 'zoho_callback' && code && !isConnecting) {
      const finalize = async () => {
        setIsConnecting(true)
        const toastId = toast.loading('Establishing secure connection...')

        try {
          const { data: { session } } = await supabase.auth.getSession()
          const token = session?.access_token

          if (!token) throw new Error("No session found")

          const res = await fetch('/api/auth/zoho/finalize-connection', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ code })
          })

          if (!res.ok) {
            const err = await res.json()
            throw new Error(err.error || 'Failed to connect')
          }

          const result = await res.json()
          toast.success(`Account ${result.email} connected`, { id: toastId })

          // Clear URL immediately
          const newParams = new URLSearchParams(window.location.search)
          newParams.delete('action')
          newParams.delete('code')
          newParams.delete('status')
          router.replace(`${window.location.pathname}${newParams.toString() ? '?' + newParams.toString() : ''}`)

          // Proactive: Trigger a sync for the newly connected email
          if (result.email) {
            toast.promise(
              fetch('/api/email/zoho-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userEmail: result.email }),
              }),
              {
                loading: 'Syncing emails from new account...',
                success: 'Inbox synchronized',
                error: 'Initial sync failed (will retry in background)'
              }
            )
          }

          // Re-fetch connections to update UI
          await fetchConnections()
        } catch (e: any) {
          // If the error is just a cancellation or we already have the connection, suppress the "failed" toast
          if (e.message?.includes('already connected')) {
             toast.success('Account already connected', { id: toastId })
          } else {
             toast.error(e.message || 'Failed to connect account', { id: toastId })
          }
        } finally {
          setIsConnecting(false)
        }
      }
      finalize()
    }
  }, [searchParams, router, isConnecting])

  // Phone number formatter: +1 (XXX)-XXX-XXXX
  const formatPhoneNumber = (value: string) => {
    if (!value) return value
    const phoneNumber = value.replace(/[^\d]/g, '')
    const phoneNumberLength = phoneNumber.length
    if (phoneNumberLength < 4) return phoneNumber
    if (phoneNumberLength < 7) {
      return `+1 (${phoneNumber.slice(1, 4)}) ${phoneNumber.slice(4)}`
    }
    return `+1 (${phoneNumber.slice(1, 4)}) ${phoneNumber.slice(4, 7)}-${phoneNumber.slice(7, 11)}`
  }

  // Improved phone formatter to handle backspace and different lengths
  const handlePhoneInput = (value: string) => {
    const cleaned = ('' + value).replace(/\D/g, '')
    const match = cleaned.match(/^(1|)?(\d{3})(\d{3})(\d{4})$/)
    if (match) {
      const intlCode = (match[1] ? '+1 ' : '')
      return [intlCode, '(', match[2], ') ', match[3], '-', match[4]].join('')
    }
    return value
  }

  // Strict formatter for +1 (XXX)-XXX-XXXX
  const strictFormat = (value: string) => {
    const cleaned = value.replace(/\D/g, '')
    let digits = cleaned
    if (digits.startsWith('1')) {
      digits = digits.substring(1)
    }
    digits = digits.substring(0, 10)

    if (digits.length === 0) return ''

    const areaCode = digits.substring(0, 3)
    const middle = digits.substring(3, 6)
    const last = digits.substring(6, 10)

    if (digits.length > 6) {
      return `+1 (${areaCode})-${middle}-${last}`
    } else if (digits.length > 3) {
      return `+1 (${areaCode})-${middle}`
    } else if (digits.length > 0) {
      return `+1 (${areaCode}`
    }
    return value
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = strictFormat(e.target.value)
    setNewNumber(formatted)
  }

  // Sync with profile
  useEffect(() => {
    // 1. Name Resolution
    const authDisplayName = user?.user_metadata?.full_name || ''
    const authNameParts = authDisplayName.split(' ')
    const authFirstName = authNameParts[0] || ''
    const authLastName = authNameParts.slice(1).join(' ') || ''

    setFirstName(profile.firstName || authFirstName)
    setLastName(profile.lastName || authLastName)

    // 2. Other Profile Fields
    setLocalEmail(profile.email || user?.email || '')
    setBio(profile.bio || '')
    setJobTitle(profile.jobTitle || '')
    setLinkedinUrl(profile.linkedinUrl || '')
    setWebsite(profile.website || '')
    setCity(profile.city || '')
    setState(profile.state || '')
    setTwilioNumbers(profile.twilioNumbers || [])
    const twilioList = profile.twilioNumbers || []
    const idx = twilioList.findIndex(n => n.number === profile.selectedPhoneNumber)
    setSelectedIdx(idx !== -1 ? idx : (twilioList.length > 0 ? 0 : null))
    setSelectedPhoneNumber(profile.selectedPhoneNumber || (twilioList.length > 0 ? twilioList[0].number : null))
    setBridgeToMobile(profile.bridgeToMobile || false)
  }, [profile, user?.user_metadata?.full_name])

  const computedName = useMemo(() => {
    const full = `${firstName} ${lastName}`.trim()
    return full || profile.name || user?.user_metadata?.full_name || ''
  }, [firstName, lastName, profile.name, user?.user_metadata?.full_name])

  const handleUpdatePassword = async () => {
    if (!user) return
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    setIsUpdatingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      toast.success('Password updated successfully')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error: any) {
      console.error('Error updating password:', error)
      toast.error('Failed to update password: ' + error.message)
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!user?.email) {
      toast.error('You must be logged in to save profile changes')
      return
    }

    setIsSaving(true)
    try {
      const emailLower = user.email.toLowerCase().trim()
      const targetEmail = localEmail.toLowerCase().trim()

      // If email changed, we warn but don't perform the migration here
      if (targetEmail !== emailLower) {
        console.warn('[Settings] Email change detected. System-wide migration required.');
      }

      const { error } = await supabase
        .from('users')
        .update({
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          bio: bio.trim() || null,
          job_title: jobTitle.trim() || null,
          linkedin_url: linkedinUrl.trim() || null,
          settings: {
            name: computedName || null,
            twilioNumbers: twilioNumbers,
            selectedPhoneNumber: selectedIdx !== null ? twilioNumbers[selectedIdx]?.number : selectedPhoneNumber,
            bridgeToMobile: bridgeToMobile,
            role: role || 'employee', // Preserve role
            website: website.trim() || null,
            city: city.trim() || null,
            state: state.trim() || null
          },
          updated_at: new Date().toISOString(),
        })
        .eq('email', emailLower)

      if (error) throw error

      // Refresh the global profile state to update the UI immediately
      await refreshProfile()

      toast.success('Profile updated')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save profile'
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddNumber = () => {
    if (!newNumber || !newNumberName) return
    const formatted = strictFormat(newNumber)
    const updated = [...twilioNumbers, { name: newNumberName, number: formatted }]
    setTwilioNumbers(updated)
    // If it's the first number or we want to switch to new one immediately
    if (updated.length === 1 || !selectedPhoneNumber) {
      setSelectedIdx(updated.length - 1)
      setSelectedPhoneNumber(formatted)
    }
    setNewNumber('')
    setNewNumberName('')
  }

  const handleDeleteNumber = (index: number) => {
    const updated = [...twilioNumbers]
    const removed = updated.splice(index, 1)[0]
    setTwilioNumbers(updated)
    
    if (selectedIdx === index) {
      setSelectedIdx(updated.length > 0 ? 0 : null)
      setSelectedPhoneNumber(updated.length > 0 ? updated[0].number : null)
    } else if (selectedIdx !== null && selectedIdx > index) {
      setSelectedIdx(selectedIdx - 1)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex-none">
        <h1 className="text-4xl font-semibold tracking-tighter text-white">Settings</h1>
        <p className="text-zinc-500 mt-1">Manage your account settings and preferences.</p>
      </div>

      <Tabs defaultValue="profile" className="flex-1 flex flex-col min-h-0 space-y-6">
        <TabsList className="nodal-glass p-1 h-auto grid grid-cols-2 md:grid-cols-5 w-full md:w-auto shrink-0">
          <TabsTrigger value="profile" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-zinc-400">
            <UserIcon className="w-4 h-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="account" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-zinc-400">
            <Shield className="w-4 h-4 mr-2" />
            Account
          </TabsTrigger>
          <TabsTrigger value="notifications" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-zinc-400">
            <Bell className="w-4 h-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="display" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-zinc-400">
            <Palette className="w-4 h-4 mr-2" />
            Display
          </TabsTrigger>
          <TabsTrigger value="integrations" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-zinc-400">
            <Database className="w-4 h-4 mr-2" />
            Integrations
          </TabsTrigger>

        </TabsList>

        <div className="flex-1 overflow-y-auto pr-2 np-scroll">
          <TabsContent value="profile" className="space-y-6 mt-0">
            <Card className="nodal-glass">
              <CardHeader>
                <CardTitle className="text-zinc-100">Profile Information</CardTitle>
                <CardDescription className="text-zinc-500">Update your profile details and public information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="text-zinc-400">First name</Label>
                    <Input
                      id="firstName"
                      placeholder="John"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="bg-transparent border-white/10 text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-[#002FA7]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="text-zinc-400">Last name</Label>
                    <Input
                      id="lastName"
                      placeholder="Doe"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="bg-transparent border-white/10 text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-[#002FA7]"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-zinc-400">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={localEmail}
                    onChange={(e) => setLocalEmail(e.target.value)}
                    className="bg-transparent border-white/10 text-zinc-200 font-mono tabular-nums focus-visible:ring-[#002FA7]"
                  />
                  <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">
                    Contact Admin to update system-wide ID
                  </p>
                </div>

                {/* Secondary Email Accounts */}
                <div className="space-y-3">
                  <Label className="text-zinc-400">Connected Accounts (Sending)</Label>
                  <div className="space-y-2">
                    <AnimatePresence initial={false}>
                      {connections.map((conn) => (
                        <motion.div
                          key={conn.id}
                          initial={{ opacity: 0, height: 0, marginTop: 0 }}
                          animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
                          exit={{ opacity: 0, height: 0, marginTop: 0 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                          className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 group overflow-hidden"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-lg bg-[#002FA7]/20 flex items-center justify-center text-[#002FA7]">
                              <Mail className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-xs font-medium text-zinc-200">{conn.email}</p>
                              <p className="text-[10px] text-zinc-500">Secondary Sender</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={async () => {
                              if (!confirm('Disconnect this account?')) return
                              const toastId = toast.loading('Disconnecting...')
                              try {
                                const { error } = await supabase.from('zoho_connections').delete().eq('id', conn.id)
                                if (error) throw error
                                setConnections(prev => prev.filter(c => c.id !== conn.id))
                                toast.success('Account disconnected', { id: toastId })
                              } catch (e: any) {
                                toast.error('Failed to disconnect', { id: toastId })
                              }
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </motion.div>
                      ))}

                      {isConnecting && (
                        <motion.div
                          initial={{ opacity: 0, height: 0, marginTop: 0 }}
                          animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
                          className="flex items-center space-x-3 p-3 rounded-lg bg-white/[0.02] border border-white/5 border-dashed"
                        >
                          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                            <RefreshCw className="w-4 h-4 text-zinc-500 animate-spin" />
                          </div>
                          <div className="space-y-1">
                            <div className="h-3 w-32 bg-white/5 rounded animate-pulse" />
                            <div className="h-2 w-20 bg-white/5 rounded animate-pulse" />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <Button
                      onClick={() => window.location.href = '/api/auth/zoho/connect-secondary'}
                      disabled={isConnecting}
                      variant="outline"
                      size="sm"
                      className="w-full bg-transparent border-dashed border-white/20 text-zinc-400 hover:text-white hover:bg-white/5 h-9"
                    >
                      {isConnecting ? <RefreshCw className="w-3 h-3 mr-2 animate-spin" /> : <Plus className="w-3 h-3 mr-2" />}
                      Connect Secondary Account
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bio" className="text-zinc-400">Bio</Label>
                  <Input
                    id="bio"
                    placeholder="Sales Representative"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="bg-transparent border-white/10 text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-[#002FA7]"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="space-y-2">
                    <Label htmlFor="jobTitle" className="text-zinc-400">Job Title</Label>
                    <Input
                      id="jobTitle"
                      placeholder="Principal Market Architect"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      className="bg-transparent border-white/10 text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-[#002FA7]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="linkedinUrl" className="text-zinc-400">LinkedIn URL</Label>
                    <Input
                      id="linkedinUrl"
                      placeholder="https://linkedin.com/in/username"
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      className="bg-transparent border-white/10 text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-[#002FA7]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website" className="text-zinc-400">Website</Label>
                    <Input
                      id="website"
                      placeholder="https://nodalpoint.io"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      className="bg-transparent border-white/10 text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-[#002FA7]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <Label htmlFor="city" className="text-zinc-400">City</Label>
                    <Input
                      id="city"
                      placeholder="Fort Worth"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="bg-transparent border-white/10 text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-[#002FA7]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state" className="text-zinc-400">State</Label>
                    <Input
                      id="state"
                      placeholder="TX"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="bg-transparent border-white/10 text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-[#002FA7]"
                    />
                  </div>
                </div>

                <Separator className="bg-white/5 my-6" />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-zinc-200">Phone Numbers</h4>
                      <p className="text-xs text-zinc-500">Manage your Twilio numbers and routing.</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Label htmlFor="bridgeToMobile" className="text-xs text-zinc-400">Bridge to Mobile</Label>
                      <Switch
                        id="bridgeToMobile"
                        checked={bridgeToMobile}
                        onCheckedChange={setBridgeToMobile}
                        className="data-[state=checked]:bg-[#002FA7]"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    {twilioNumbers.map((num, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => {
                          setSelectedIdx(idx)
                          setSelectedPhoneNumber(num.number)
                        }}
                        className={cn(
                          "flex items-center justify-between p-4 rounded-xl transition-all duration-300 cursor-pointer group relative overflow-hidden",
                          selectedIdx === idx 
                            ? "bg-[#002FA7]/10 border border-[#002FA7]/30 ring-1 ring-[#002FA7]/20" 
                            : "bg-white/[0.02] border border-white/5 hover:border-white/10 hover:bg-white/[0.04]"
                        )}
                      >
                        {selectedIdx === idx && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#002FA7]" />
                        )}
                        <div className="flex items-center gap-4">
                          <div
                            className={cn(
                              "w-5 h-5 rounded-full border flex items-center justify-center transition-all duration-300",
                              selectedIdx === idx
                                ? "bg-[#002FA7] border-[#002FA7] scale-110"
                                : "border-white/20 group-hover:border-white/40"
                            )}
                          >
                            {selectedIdx === idx && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                          </div>
                          <div>
                            <p className={cn(
                              "text-sm font-medium transition-colors",
                              selectedIdx === idx ? "text-white" : "text-zinc-300"
                            )}>
                              {num.name}
                            </p>
                            <p className="text-xs text-zinc-500 font-mono tabular-nums tracking-wide mt-0.5">
                              {num.number}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {selectedIdx === idx && (
                            <Badge variant="outline" className="border-[#002FA7]/40 text-[9px] font-mono text-white bg-[#002FA7]/20 uppercase px-1.5 h-5 leading-none">
                              Active Uplink
                            </Badge>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteNumber(idx)
                            }}
                            className="icon-button-forensic opacity-0 group-hover:opacity-100 h-8 w-8 flex items-center justify-center text-zinc-500 hover:text-red-400 transition-all hover:bg-red-400/10 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                      <Input
                        placeholder="Number Name (e.g. Office)"
                        value={newNumberName}
                        onChange={(e) => setNewNumberName(e.target.value)}
                        className="bg-transparent border-white/10 text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-[#002FA7]"
                      />
                      <Input
                        placeholder="+1 (555)-000-0000"
                        value={newNumber}
                        onChange={handlePhoneChange}
                        className="bg-transparent border-white/10 text-zinc-200 font-mono tabular-nums placeholder:text-zinc-600 focus-visible:ring-[#002FA7]"
                      />
                      <Button
                        onClick={handleAddNumber}
                        variant="outline"
                        className="border-white/10 text-zinc-400 hover:text-white hover:bg-white/5"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Number
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  onClick={handleSaveProfile}
                  disabled={isSaving || !user?.email}
                  className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="account" className="space-y-6 mt-0">
            <Card className="nodal-glass">
              <CardHeader>
                <CardTitle className="text-zinc-100">Password</CardTitle>
                <CardDescription className="text-zinc-500">Change your password here. You may need to re-login if you haven&apos;t recently.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new" className="text-zinc-400">New password</Label>
                  <Input
                    id="new"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="bg-transparent border-white/10 text-zinc-200 focus-visible:ring-[#002FA7]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm" className="text-zinc-400">Confirm password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="bg-transparent border-white/10 text-zinc-200 focus-visible:ring-[#002FA7]"
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  onClick={handleUpdatePassword}
                  disabled={isUpdatingPassword || !newPassword}
                  className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium"
                >
                  {isUpdatingPassword ? 'Updating...' : 'Set Password'}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6 mt-0">
            <Card className="nodal-glass">
              <CardHeader>
                <CardTitle className="text-zinc-100">Notification Preferences</CardTitle>
                <CardDescription className="text-zinc-500">Choose what you want to be notified about.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between space-x-2">
                  <Label htmlFor="emails" className="flex flex-col space-y-1 text-zinc-200">
                    <span>Email Notifications</span>
                    <span className="font-normal text-xs text-zinc-500">Receive emails about your account activity.</span>
                  </Label>
                  <Switch id="emails" className="data-[state=checked]:bg-[#002FA7]" />
                </div>
                <Separator className="bg-white/5" />
                <div className="flex items-center justify-between space-x-2">
                  <Label htmlFor="marketing" className="flex flex-col space-y-1 text-zinc-200">
                    <span>Marketing Emails</span>
                    <span className="font-normal text-xs text-zinc-500">Receive emails about new products, features, and more.</span>
                  </Label>
                  <Switch id="marketing" className="data-[state=checked]:bg-[#002FA7]" />
                </div>
                <Separator className="bg-white/5" />
                <div className="flex items-center justify-between space-x-2">
                  <Label htmlFor="security" className="flex flex-col space-y-1 text-zinc-200">
                    <span>Security Emails</span>
                    <span className="font-normal text-xs text-zinc-500">Receive emails about your account security.</span>
                  </Label>
                  <Switch id="security" defaultChecked className="data-[state=checked]:bg-[#002FA7]" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="display" className="space-y-6 mt-0">
            <Card className="nodal-glass border-white/5">
              <CardHeader>
                <CardTitle className="text-zinc-100 flex items-center gap-2">
                  <Palette className="w-5 h-5 text-[#002FA7]" />
                  Interface & Audio
                </CardTitle>
                <CardDescription className="text-zinc-500">Customize the sensory experience of the Nodal Point network.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Audio Engine Settings */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <h4 className="text-sm font-medium text-zinc-200">Forensic Audio Engine</h4>
                      <p className="text-xs text-zinc-500">Master toggle for synthesized audio feedback.</p>
                    </div>
                    <Switch 
                      checked={soundEnabled} 
                      onCheckedChange={setSoundEnabled}
                      className="data-[state=checked]:bg-[#002FA7]" 
                    />
                  </div>
                  
                  <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-4 transition-all duration-500", !soundEnabled && "opacity-30 grayscale pointer-events-none")}>
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-mono uppercase tracking-widest text-zinc-400">Tactical Pings</Label>
                        <Switch 
                          checked={soundIncomingEnabled} 
                          onCheckedChange={setSoundIncomingEnabled}
                          className="data-[state=checked]:bg-[#002FA7]" 
                        />
                      </div>
                      <p className="text-[10px] text-zinc-500 leading-relaxed italic">Emails, contract opens, and real-time tracking signals.</p>
                    </div>

                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-mono uppercase tracking-widest text-zinc-400">Action Clicks</Label>
                        <Switch 
                          checked={soundActionEnabled} 
                          onCheckedChange={setSoundActionEnabled}
                          className="data-[state=checked]:bg-[#002FA7]" 
                        />
                      </div>
                      <p className="text-[10px] text-zinc-500 leading-relaxed italic">High-intent transmissions and forensic data generation.</p>
                    </div>

                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-mono uppercase tracking-widest text-zinc-400">Navigation Pulses</Label>
                        <Switch 
                          checked={soundNavigationEnabled} 
                          onCheckedChange={setSoundNavigationEnabled}
                          className="data-[state=checked]:bg-[#002FA7]" 
                        />
                      </div>
                      <p className="text-[10px] text-zinc-500 leading-relaxed italic">Subtle sine-based feedback for menu transitions.</p>
                    </div>

                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-mono uppercase tracking-widest text-zinc-400">Critical Alerts</Label>
                        <Switch 
                          checked={soundCriticalEnabled} 
                          onCheckedChange={setSoundCriticalEnabled}
                          className="data-[state=checked]:bg-[#002FA7]" 
                        />
                      </div>
                      <p className="text-[10px] text-zinc-500 leading-relaxed italic">Liability warnings and system-critical klaxons.</p>
                    </div>
                  </div>
                </div>

                <Separator className="bg-white/5" />

                {/* Aesthetic Themes */}
                <div className="space-y-4 opacity-70">
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-medium text-zinc-200">Aesthetic Protocols</h4>
                    <p className="text-xs text-zinc-500">Visual system overrides (Experimental).</p>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2">
                    <div className="aspect-square rounded-lg border border-[#002FA7] bg-[#002FA7]/5 p-2 flex flex-col justify-end transition-all">
                       <span className="text-[9px] font-mono text-white">OBSIDIAN</span>
                    </div>
                    <div className="aspect-square rounded-lg border border-white/5 bg-white/[0.01] p-2 flex flex-col justify-end grayscale cursor-not-allowed hover:bg-white/[0.02] transition-colors">
                       <span className="text-[9px] font-mono text-zinc-600">MONOCHROME</span>
                    </div>
                    <div className="aspect-square rounded-lg border border-white/5 bg-white/[0.01] p-2 flex flex-col justify-end grayscale cursor-not-allowed hover:bg-white/[0.02] transition-colors">
                       <span className="text-[9px] font-mono text-zinc-600">HIGH CONTRAST</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-600 font-mono italic flex items-center gap-1">
                    <Lock className="w-3 h-3" /> System locked to Obsidian Void [v1.0]
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations" className="space-y-6 mt-0">
            <div className="flex items-center justify-between mb-2">
              <div className="space-y-0.5">
                <h3 className="text-lg font-medium text-zinc-100 font-sans tracking-tight">Integration Matrix</h3>
                <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Connected Infrastructure & API Endpoints</p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={runDiagnostics}
                disabled={isCheckingHealth}
                className="nodal-glass border-white/5 text-zinc-400 hover:text-white hover:border-white/20 transition-all font-mono text-[10px]"
              >
                <RefreshCw className={cn("w-3 h-3 mr-2", isCheckingHealth && "animate-spin")} />
                {isCheckingHealth ? 'RUNNING DIAGNOSTIC...' : 'INITIATE MATRIX SCAN'}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              {/* CORE ENGINE */}
              <Card className="nodal-glass border-white/5 overflow-hidden !p-0 !gap-0">
                <CardHeader className="h-11 px-5 border-b border-white/5 bg-white/[0.03] flex items-center justify-between !p-0 !gap-0 !px-5">
                  <CardTitle className="text-[10px] font-mono tracking-[0.2em] text-zinc-100 flex items-center gap-2.5 uppercase leading-none">
                    <Database className="w-3.5 h-3.5 text-zinc-400" /> Core Systems
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                    <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-tight">Operational</span>
                  </div>
                </CardHeader>
                <div className="divide-y divide-white/5">
                    <div className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.01] transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-zinc-900/50 border border-white/5">
                          <Network className="w-4 h-4 text-zinc-400" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-zinc-200">Supabase DB</p>
                          <p className="text-[10px] text-zinc-500 font-mono tracking-tighter">gfitvnkaevozbcyostez.supabase.co</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="border-white/10 text-[9px] font-mono text-emerald-500 uppercase bg-emerald-500/5">Primary</Badge>
                    </div>

                    <div className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.01] transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-zinc-900/50 border border-white/5">
                          <Globe className="w-4 h-4 text-zinc-400" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-zinc-200">Vercel Deployment</p>
                          <p className="text-[10px] text-zinc-500 font-mono tracking-tighter">{diagData?.vercelUrl || 'nodalpoint.io'}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="border-white/10 text-[9px] font-mono text-zinc-500 uppercase">Edge</Badge>
                    </div>
                  </div>
                </Card>

              {/* COMMUNICATIONS */}
              <Card className="nodal-glass border-white/5 overflow-hidden !p-0 !gap-0">
                <CardHeader className="h-11 px-5 border-b border-white/5 bg-white/[0.03] flex items-center justify-between !p-0 !gap-0 !px-5">
                  <CardTitle className="text-[10px] font-mono tracking-[0.2em] text-zinc-100 flex items-center gap-2.5 uppercase leading-none">
                    <Radio className="w-3.5 h-3.5 text-zinc-400" /> Uplink Protocols
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <div className={cn("w-1.5 h-1.5 rounded-full", isSyncing ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)] animate-pulse" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]")} />
                    <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-tight">{isSyncing ? 'Transmitting' : 'Idle'}</span>
                  </div>
                </CardHeader>
                <div className="divide-y divide-white/5">
                    <div className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.01] transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-zinc-900/50 border border-white/5">
                          <Mail className="w-4 h-4 text-zinc-400" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-zinc-200">Zoho Mail API</p>
                          <p className="text-[10px] text-zinc-500 font-mono">
                            {lastSyncTime ? `Last Check: ${new Date(lastSyncTime).toLocaleTimeString()}` : 'No recent sync'}
                          </p>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => performSync()}
                        disabled={isSyncing}
                        className="h-7 w-7 text-zinc-500 hover:text-white hover:bg-white/5"
                      >
                        <RefreshCw className={cn("w-3.5 h-3.5", isSyncing && "animate-spin")} />
                      </Button>
                    </div>

                    <div className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.01] transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-zinc-900/50 border border-white/5">
                          <Phone className="w-4 h-4 text-zinc-400" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-zinc-200">Twilio Voice</p>
                          <p className="text-[10px] text-zinc-500 font-mono">Forensic Call Engine Active</p>
                        </div>
                      </div>
                      <div className="text-[9px] font-mono text-emerald-500 px-2 py-0.5 border border-emerald-500/20 bg-emerald-500/5 rounded">LIVE</div>
                    </div>
                  </div>
                </Card>

              {/* INTELLIGENCE TIER */}
              <Card className="nodal-glass border-white/5 overflow-hidden !p-0 !gap-0">
                <CardHeader className="h-11 px-5 border-b border-white/5 bg-white/[0.03] flex items-center justify-between !p-0 !gap-0 !px-5">
                  <CardTitle className="text-[10px] font-mono tracking-[0.2em] text-zinc-100 flex items-center gap-2.5 uppercase leading-none">
                    <Brain className="w-3.5 h-3.5 text-zinc-400" /> Cognitive Engine
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                    <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-tight">Neural Ready</span>
                  </div>
                </CardHeader>
                <div className="divide-y divide-white/5">
                    <div className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.01] transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-zinc-900/50 border border-white/5">
                          <Fingerprint className="w-4 h-4 text-zinc-400" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-zinc-200">Gemini Neural Network</p>
                          <p className="text-[10px] text-zinc-500 font-mono">1.5 Pro Flash System active</p>
                        </div>
                      </div>
                      <Cpu className="w-3.5 h-3.5 text-zinc-700" />
                    </div>

                    <div className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.01] transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-zinc-900/50 border border-white/5">
                          <Activity className="w-4 h-4 text-zinc-400" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-zinc-200">AssemblyAI Transcription</p>
                          <p className="text-[10px] text-zinc-500 font-mono">Real-time Call Intelligence</p>
                        </div>
                      </div>
                      <Activity className="w-3.5 h-3.5 text-zinc-700" />
                    </div>
                  </div>
                </Card>

              {/* MARKET INFRASTRUCTURE */}
              <Card className="nodal-glass border-white/5 overflow-hidden !p-0 !gap-0">
                <CardHeader className="h-11 px-5 border-b border-white/5 bg-white/[0.03] flex items-center justify-between !p-0 !gap-0 !px-5">
                  <CardTitle className="text-[10px] font-mono tracking-[0.2em] text-zinc-100 flex items-center gap-2.5 uppercase leading-none">
                    <Zap className="w-3.5 h-3.5 text-zinc-400" /> Market Telemetry
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                    <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-tight">Grid Sync Active</span>
                  </div>
                </CardHeader>
                <div className="divide-y divide-white/5">
                    <div className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.01] transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-zinc-900/50 border border-white/5">
                          <Network className="w-4 h-4 text-zinc-400" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-zinc-200">ERCOT ISO Feed</p>
                          <p className="text-[10px] text-zinc-500 font-mono">SCED Pricing & Scarcity Signals</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => router.push('/network/telemetry')} className="h-7 w-7 text-zinc-500 hover:text-white">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    <div className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.01] transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-zinc-900/50 border border-white/5">
                          <Globe className="w-4 h-4 text-zinc-400" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-zinc-200">EIA Retail API</p>
                          <p className="text-[10px] text-zinc-500 font-mono">Open Data Governance Connected</p>
                        </div>
                      </div>
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500/50" />
                    </div>
                  </div>
                </Card>
            </div>

            {/* Diagnostics Console (Advanced) */}
            <Card className="nodal-glass border-white/5 !p-0 !gap-0 overflow-hidden">
              <CardHeader className="h-9 px-4 border-b border-white/5 bg-white/[0.03] flex items-center !p-0 !gap-0 !px-4">
                <CardTitle className="text-[10px] font-mono tracking-widest text-zinc-400 uppercase leading-none">Diagnostics Log</CardTitle>
              </CardHeader>
              <CardContent className="py-4 px-4">
                <div className="p-4 bg-black/40 rounded border border-white/5 font-mono text-[10px] min-h-[100px] text-zinc-500 space-y-1">
                  {diagData ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-zinc-600">[{diagData.serverTime}]</span>
                        <span className="text-emerald-500">INIT_SUCCESS</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-1 mt-2">
                        {Object.entries(diagData.envFlags || {}).map(([key, value]) => (
                          <div key={key} className="flex justify-between border-b border-white/[0.02] pb-1">
                            <span className="text-zinc-500 capitalize">{key.replace(/_/g, ' ').toLowerCase()}</span>
                            <span className={cn(value ? "text-emerald-500/80" : "text-red-500/50")}>
                              {value ? 'READY' : 'MISSING'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="animate-pulse">Waiting for manual matrix scan...</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>


        </div>
      </Tabs>
    </div>
  )
}

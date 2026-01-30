'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Bell, Shield, Palette, Database, Trash2, Plus, Phone, User as UserIcon, Lock } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { auth } from '@/lib/firebase'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { updatePassword } from 'firebase/auth'
import { toast } from 'sonner'

export default function SettingsPage() {
  const { user, profile, role, refreshProfile } = useAuth()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [bio, setBio] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [twilioNumbers, setTwilioNumbers] = useState<Array<{ name: string; number: string }>>([])
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string | null>(null)
  const [bridgeToMobile, setBridgeToMobile] = useState(false)
  const [newNumber, setNewNumber] = useState('')
  const [newNumberName, setNewNumberName] = useState('')
  const [isSaving, setIsSaving] = useState(false)

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
    const authDisplayName = user?.displayName || ''
    const authNameParts = authDisplayName.split(' ')
    const authFirstName = authNameParts[0] || ''
    const authLastName = authNameParts.slice(1).join(' ') || ''

    setFirstName(profile.firstName || authFirstName)
    setLastName(profile.lastName || authLastName)
    
    // 2. Other Profile Fields
    setBio(profile.bio || '')
    setJobTitle(profile.jobTitle || '')
    setLinkedinUrl(profile.linkedinUrl || '')
    setTwilioNumbers(profile.twilioNumbers || [])
    setSelectedPhoneNumber(profile.selectedPhoneNumber || null)
    setBridgeToMobile(profile.bridgeToMobile || false)
  }, [profile, user?.displayName])

  const computedName = useMemo(() => {
    const full = `${firstName} ${lastName}`.trim()
    return full || profile.name || user?.displayName || ''
  }, [firstName, lastName, profile.name, user?.displayName])

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
      await updatePassword(user, newPassword)
      toast.success('Password updated successfully')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error: unknown) {
      console.error('Error updating password:', error)
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
      if (error && typeof error === 'object' && 'code' in error && error.code === 'auth/requires-recent-login') {
        toast.error('Please log out and log back in to change your password')
      } else {
        toast.error('Failed to update password: ' + errorMessage)
      }
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
            selectedPhoneNumber: selectedPhoneNumber,
            bridgeToMobile: bridgeToMobile,
            role: role || 'employee' // Preserve role
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
    // Ensure the number is formatted correctly before adding
    const formatted = strictFormat(newNumber)
    const updated = [...twilioNumbers, { name: newNumberName, number: formatted }]
    setTwilioNumbers(updated)
    // If it's the first number, select it automatically
    if (updated.length === 1) {
      setSelectedPhoneNumber(formatted)
    }
    setNewNumber('')
    setNewNumberName('')
  }

  const handleDeleteNumber = (index: number) => {
    const updated = [...twilioNumbers]
    const removed = updated.splice(index, 1)[0]
    setTwilioNumbers(updated)
    if (selectedPhoneNumber === removed.number) {
      setSelectedPhoneNumber(null)
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
                    value={profile.email || user?.email || ''}
                    readOnly
                    className="bg-transparent border-white/10 text-zinc-500 font-mono tabular-nums"
                  />
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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

                <div className="space-y-3">
                  {twilioNumbers.map((num, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-lg nodal-glass nodal-glass-hover group">
                      <div className="flex items-center gap-3">
                        <div 
                          className={cn(
                            "w-4 h-4 rounded-full border flex items-center justify-center cursor-pointer transition-colors",
                            selectedPhoneNumber === num.number 
                              ? "bg-[#002FA7] border-[#002FA7]" 
                              : "border-white/20 hover:border-white/40"
                          )}
                          onClick={() => setSelectedPhoneNumber(num.number)}
                        >
                          {selectedPhoneNumber === num.number && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-zinc-200">{num.name}</p>
                          <p className="text-xs text-zinc-500 font-mono tabular-nums tracking-tight">{num.number}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDeleteNumber(idx)}
                        className="icon-button-forensic opacity-0 group-hover:opacity-100 h-8 w-8 flex items-center justify-center text-zinc-500 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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

          <TabsContent value="integrations" className="space-y-6 mt-0">
            <Card className="nodal-glass">
               <CardHeader>
                <CardTitle className="text-zinc-100">API Integrations</CardTitle>
                <CardDescription className="text-zinc-500">Manage your connected services.</CardDescription>
              </CardHeader>
               <CardContent className="space-y-4">
                 <div className="flex items-center justify-between p-4 rounded-lg nodal-glass nodal-glass-hover">
                   <div className="flex items-center space-x-4">
                     <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-500">
                       <Database className="w-5 h-5" />
                     </div>
                     <div>
                       <p className="text-sm font-medium text-zinc-200">Firebase</p>
                       <p className="text-xs text-zinc-500">Connected</p>
                     </div>
                   </div>
                   <Button variant="outline" size="sm" className="border-white/10 text-zinc-400 hover:text-white hover:bg-white/5">Configure</Button>
                 </div>
                 
                  <div className="flex items-center justify-between p-4 rounded-lg nodal-glass nodal-glass-hover">
                   <div className="flex items-center space-x-4">
                     <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-500">
                       <Phone className="w-5 h-5" />
                     </div>
                     <div>
                       <p className="text-sm font-medium text-zinc-200">Twilio</p>
                       <p className="text-xs text-zinc-500 font-mono tabular-nums">{twilioNumbers.length > 0 ? 'Connected' : 'Not Configured'}</p>
                     </div>
                   </div>
                   <Button 
                     variant="outline" 
                     size="sm" 
                     onClick={() => document.querySelector('[value="profile"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))}
                     className="border-white/10 text-zinc-400 hover:text-white hover:bg-white/5"
                   >
                     Manage Numbers
                   </Button>
                 </div>

                 <div className="flex items-center justify-between p-4 rounded-lg bg-transparent border border-white/5">
                   <div className="flex items-center space-x-4">
                     <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500">
                       <Database className="w-5 h-5" />
                     </div>
                     <div>
                       <p className="text-sm font-medium text-zinc-200">Stripe</p>
                       <p className="text-xs text-zinc-500">Not Connected</p>
                     </div>
                   </div>
                   <Button variant="outline" size="sm" className="border-white/10 text-zinc-400 hover:text-white hover:bg-white/5">Connect</Button>
                 </div>
               </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

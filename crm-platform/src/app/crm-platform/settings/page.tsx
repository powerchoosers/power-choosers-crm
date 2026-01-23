'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Bell, Shield, Palette, Database, Trash2, Plus, Phone, User as UserIcon } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { db } from '@/lib/firebase'
import { cn } from '@/lib/utils'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { toast } from 'sonner'

export default function SettingsPage() {
  const { user, profile } = useAuth()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [bio, setBio] = useState('')
  const [twilioNumbers, setTwilioNumbers] = useState<Array<{ name: string; number: string }>>([])
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string | null>(null)
  const [bridgeToMobile, setBridgeToMobile] = useState(false)
  const [newNumber, setNewNumber] = useState('')
  const [newNumberName, setNewNumberName] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Sync with profile and check legacy settings
  useEffect(() => {
    setFirstName(profile.firstName || '')
    setLastName(profile.lastName || '')
    setBio(profile.bio || '')
    setTwilioNumbers(profile.twilioNumbers || [])
    setSelectedPhoneNumber(profile.selectedPhoneNumber || null)
    setBridgeToMobile(profile.bridgeToMobile || false)

    // Legacy Data Migration Check
    const checkLegacyData = async () => {
      if (!user?.email) return
      // Only check if we don't have numbers yet (avoid overwriting if user has already migrated/saved)
      if (profile.twilioNumbers && profile.twilioNumbers.length > 0) return

      try {
        const legacyId = `user-settings-${user.email.toLowerCase()}`
        const legacyRef = doc(db, 'settings', legacyId)
        const legacySnap = await getDoc(legacyRef)

        if (legacySnap.exists()) {
          const data = legacySnap.data()
          if (data.twilioNumbers && Array.isArray(data.twilioNumbers) && data.twilioNumbers.length > 0) {
            setTwilioNumbers(data.twilioNumbers)
            if (data.selectedPhoneNumber) setSelectedPhoneNumber(data.selectedPhoneNumber)
            if (typeof data.bridgeToMobile === 'boolean') setBridgeToMobile(data.bridgeToMobile)
            toast.info('Legacy phone settings detected. Click "Save Changes" to import them.')
          }
        }
      } catch (err) {
        console.warn('Failed to check legacy settings:', err)
      }
    }

    checkLegacyData()
  }, [profile, user?.email])

  const computedName = useMemo(() => {
    const full = `${firstName} ${lastName}`.trim()
    return full || profile.name || user?.displayName || ''
  }, [firstName, lastName, profile.name, user?.displayName])

  const handleSaveProfile = async () => {
    if (!user?.email) {
      toast.error('You must be logged in to save profile changes')
      return
    }

    setIsSaving(true)
    try {
      const ref = doc(db, 'users', user.email.toLowerCase())
      await setDoc(
        ref,
        {
          email: user.email.toLowerCase(),
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          name: computedName ? computedName : null,
          displayName: computedName ? computedName : null,
          bio: bio.trim() || null,
          twilioNumbers: twilioNumbers,
          selectedPhoneNumber: selectedPhoneNumber,
          bridgeToMobile: bridgeToMobile,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      )
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
    const updated = [...twilioNumbers, { name: newNumberName, number: newNumber }]
    setTwilioNumbers(updated)
    // If it's the first number, select it automatically
    if (updated.length === 1) {
      setSelectedPhoneNumber(newNumber)
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-zinc-400 mt-1">Manage your account settings and preferences.</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="bg-zinc-900/50 border border-white/5 p-1 h-auto grid grid-cols-2 md:grid-cols-5 w-full md:w-auto">
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
        
        <TabsContent value="profile" className="space-y-4">
          <Card className="bg-zinc-900/30 border-white/5">
            <CardHeader>
              <CardTitle className="text-zinc-100">Profile Information</CardTitle>
              <CardDescription className="text-zinc-500">Update your profile details and public information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-zinc-400">First name</Label>
                  <Input
                    id="firstName"
                    placeholder="John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="bg-zinc-950/50 border-white/10 text-zinc-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-zinc-400">Last name</Label>
                  <Input
                    id="lastName"
                    placeholder="Doe"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="bg-zinc-950/50 border-white/10 text-zinc-200"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-400">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={user?.email || ''}
                  readOnly
                  className="bg-zinc-950/50 border-white/10 text-zinc-200"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio" className="text-zinc-400">Bio</Label>
                <Input
                  id="bio"
                  placeholder="Sales Representative"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                className="bg-zinc-950/50 border-white/10 text-zinc-200"
              />
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
                  />
                </div>
              </div>

              <div className="space-y-3">
                {twilioNumbers.map((num, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/30 border border-white/5 group">
                    <div className="flex items-center gap-3">
                      <div 
                        className={cn(
                          "w-4 h-4 rounded-full border flex items-center justify-center cursor-pointer transition-colors",
                          selectedPhoneNumber === num.number 
                            ? "bg-[#004eea] border-[#004eea]" 
                            : "border-white/20 hover:border-white/40"
                        )}
                        onClick={() => setSelectedPhoneNumber(num.number)}
                      >
                        {selectedPhoneNumber === num.number && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-200">{num.name}</p>
                        <p className="text-xs text-zinc-500">{num.number}</p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleDeleteNumber(idx)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                  <Input
                    placeholder="Number Name (e.g. Office)"
                    value={newNumberName}
                    onChange={(e) => setNewNumberName(e.target.value)}
                    className="bg-zinc-950/50 border-white/10 text-zinc-200"
                  />
                  <Input
                    placeholder="+1 (555) 000-0000"
                    value={newNumber}
                    onChange={(e) => setNewNumber(e.target.value)}
                    className="bg-zinc-950/50 border-white/10 text-zinc-200"
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
                className="bg-[#004eea] hover:bg-[#003bb0] text-white"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="account" className="space-y-4">
          <Card className="bg-zinc-900/30 border-white/5">
            <CardHeader>
              <CardTitle className="text-zinc-100">Password</CardTitle>
              <CardDescription className="text-zinc-500">Change your password here. After saving, you&apos;ll be logged out.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current" className="text-zinc-400">Current password</Label>
                <Input id="current" type="password" className="bg-zinc-950/50 border-white/10 text-zinc-200" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new" className="text-zinc-400">New password</Label>
                <Input id="new" type="password" className="bg-zinc-950/50 border-white/10 text-zinc-200" />
              </div>
            </CardContent>
            <CardFooter>
              <Button className="bg-[#004eea] hover:bg-[#003bb0] text-white">Change Password</Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="notifications" className="space-y-4">
          <Card className="bg-zinc-900/30 border-white/5">
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
                <Switch id="emails" />
              </div>
              <Separator className="bg-white/5" />
              <div className="flex items-center justify-between space-x-2">
                <Label htmlFor="marketing" className="flex flex-col space-y-1 text-zinc-200">
                  <span>Marketing Emails</span>
                  <span className="font-normal text-xs text-zinc-500">Receive emails about new products, features, and more.</span>
                </Label>
                <Switch id="marketing" />
              </div>
              <Separator className="bg-white/5" />
               <div className="flex items-center justify-between space-x-2">
                <Label htmlFor="security" className="flex flex-col space-y-1 text-zinc-200">
                  <span>Security Emails</span>
                  <span className="font-normal text-xs text-zinc-500">Receive emails about your account security.</span>
                </Label>
                <Switch id="security" defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-4">
          <Card className="bg-zinc-900/30 border-white/5">
             <CardHeader>
              <CardTitle className="text-zinc-100">API Integrations</CardTitle>
              <CardDescription className="text-zinc-500">Manage your connected services.</CardDescription>
            </CardHeader>
             <CardContent className="space-y-4">
               <div className="flex items-center justify-between p-4 border border-white/5 rounded-lg bg-white/5">
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
               
                <div className="flex items-center justify-between p-4 border border-white/5 rounded-lg bg-white/5">
                 <div className="flex items-center space-x-4">
                   <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-500">
                     <Phone className="w-5 h-5" />
                   </div>
                   <div>
                     <p className="text-sm font-medium text-zinc-200">Twilio</p>
                     <p className="text-xs text-zinc-500">{twilioNumbers.length > 0 ? 'Connected' : 'Not Configured'}</p>
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

               <div className="flex items-center justify-between p-4 border border-white/5 rounded-lg bg-transparent">
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
      </Tabs>
    </div>
  )
}

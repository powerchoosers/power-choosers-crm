'use client'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { User, Bell, Shield, Palette, Database } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-zinc-400 mt-1">Manage your account settings and preferences.</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="bg-zinc-900/50 border border-white/5 p-1 h-auto grid grid-cols-2 md:grid-cols-5 w-full md:w-auto">
          <TabsTrigger value="profile" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-zinc-400">
            <User className="w-4 h-4 mr-2" />
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
                  <Input id="firstName" placeholder="John" className="bg-zinc-950/50 border-white/10 text-zinc-200" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-zinc-400">Last name</Label>
                  <Input id="lastName" placeholder="Doe" className="bg-zinc-950/50 border-white/10 text-zinc-200" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-400">Email</Label>
                <Input id="email" type="email" placeholder="john.doe@example.com" className="bg-zinc-950/50 border-white/10 text-zinc-200" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio" className="text-zinc-400">Bio</Label>
                <Input id="bio" placeholder="Sales Representative" className="bg-zinc-950/50 border-white/10 text-zinc-200" />
              </div>
            </CardContent>
            <CardFooter>
              <Button className="bg-[#004eea] hover:bg-[#003bb0] text-white">Save Changes</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="account" className="space-y-4">
          <Card className="bg-zinc-900/30 border-white/5">
            <CardHeader>
              <CardTitle className="text-zinc-100">Password</CardTitle>
              <CardDescription className="text-zinc-500">Change your password here. After saving, you'll be logged out.</CardDescription>
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

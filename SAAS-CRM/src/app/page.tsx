import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Zap, BarChart3, Shield, Globe, Users, ArrowRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Nodal Point | The Intelligence Platform for Energy Brokers',
  description: 'The first and only high-fidelity prospecting and forensic intelligence platform built specifically for commercial energy consultants and brokers.',
  alternates: { canonical: 'https://nodalpoint.io' },
}

export default function LandingPage() {
  return (
    <div className="bg-[#09090F] text-zinc-100 min-h-screen font-sans antialiased selection:bg-[#2B5BFF] selection:text-white overflow-x-hidden">
      
      {/* Navigation */}
      <nav className="fixed top-0 left-0 w-full z-50 bg-[#09090F]/80 backdrop-blur-md border-b border-zinc-800/50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center p-1.5">
              <div className="relative w-full h-full">
                <Image src="/images/nodalpoint.png" alt="Nodal Point" fill className="object-contain" priority />
              </div>
            </div>
            <span className="font-bold text-xl tracking-tight text-white">Nodal Point</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <Link href="#features" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Features</Link>
            <Link href="#intelligence" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Intelligence</Link>
            <Link href="#solutions" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Solutions</Link>
          </div>

          <div className="flex items-center gap-6">
            <Link href="/login" className="text-sm font-semibold text-zinc-300 hover:text-white transition-colors">
              Log In
            </Link>
            <Link href="/login">
              <Button className="bg-[#2B5BFF] hover:bg-[#1A3ACC] text-white font-semibold rounded-full px-6 transition-all transform hover:scale-105 shadow-lg shadow-blue-600/20">
                Get Started Free
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero Section */}
        <section className="pt-40 pb-24 px-6 relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full -z-10 opacity-20 pointer-events-none">
            <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600 rounded-full blur-[120px]" />
            <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-indigo-600 rounded-full blur-[100px]" />
          </div>

          <div className="max-w-7xl mx-auto flex flex-col items-center text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-900/20 border border-blue-800/30 text-[#60A5FA] text-xs font-bold uppercase tracking-widest mb-8">
              <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
              Built Specifically for Energy Consultants & Brokers
            </div>

            <h1 className="text-[clamp(2.5rem,7vw,5.5rem)] font-black leading-[1.05] tracking-tight mb-8 max-w-5xl">
              <span className="text-white">Close more deals with</span><br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#2B5BFF] to-[#60A5FA]">forensic intelligence.</span>
            </h1>

            <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mb-12 leading-relaxed">
              Stop playing catch-up. Nodal Point gives energy brokers the high-fidelity data needed to spot cost leakage, diagnose account risk, and win larger commercial contracts.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center max-w-lg mx-auto mb-16">
              <input 
                type="email" 
                placeholder="Enter your work email" 
                className="w-full h-14 px-6 rounded-full bg-[#111118] border border-zinc-800 text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#2B5BFF] focus:ring-1 focus:ring-[#2B5BFF] transition-all"
              />
              <Link href="/login" className="w-full sm:w-auto">
                <Button className="w-full h-14 rounded-full px-10 bg-[#2B5BFF] hover:bg-[#1A3ACC] text-white font-bold text-lg whitespace-nowrap shadow-xl shadow-blue-900/30">
                  Start Prospecting Free
                </Button>
              </Link>
            </div>

            {/* Product Mockup */}
            <div className="w-full relative max-w-6xl">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl blur opacity-20" />
              <div className="relative w-full aspect-[16/9] bg-[#0A0A14] rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden flex flex-col">
                <div className="h-10 border-b border-zinc-800/50 bg-[#0A0A14] flex items-center px-4 justify-between">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/50"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/50"></div>
                  </div>
                  <div className="text-[10px] text-zinc-600 font-mono">NODAL POINT DASHBOARD // v2.0.4</div>
                </div>
                <div className="flex-1 p-8 flex flex-col gap-6">
                  <div className="grid grid-cols-3 gap-6">
                    <div className="h-32 nodal-glass rounded-xl border border-white/5 p-4 flex flex-col justify-between">
                      <div className="text-[10px] text-blue-400 uppercase tracking-tighter">Broker Margin Potential</div>
                      <div className="text-2xl font-mono">$12,400</div>
                      <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="w-3/4 h-full bg-blue-500"></div>
                      </div>
                    </div>
                    <div className="h-32 nodal-glass rounded-xl border border-white/5 p-4 flex flex-col justify-between">
                      <div className="text-[10px] text-green-400 uppercase tracking-tighter">Client Savings Found</div>
                      <div className="text-2xl font-mono">$4.2M</div>
                      <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="w-1/2 h-full bg-green-500"></div>
                      </div>
                    </div>
                    <div className="h-32 nodal-glass rounded-xl border border-white/5 p-4 flex flex-col justify-between">
                      <div className="text-[10px] text-purple-400 uppercase tracking-tighter">Qualified Prospects</div>
                      <div className="text-2xl font-mono">1,024</div>
                      <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="w-full h-full bg-purple-500"></div>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 nodal-glass rounded-xl border border-white/5 p-6 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-xs font-semibold">Broker Intelligence Radar</div>
                      <div className="flex gap-2">
                        <div className="w-20 h-6 rounded bg-white/5"></div>
                        <div className="w-20 h-6 rounded bg-[#2B5BFF]/20"></div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {[1,2,3,4,5].map(i => (
                        <div key={i} className="h-10 flex items-center justify-between px-4 rounded-lg bg-white/5 border border-white/5">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                            <div className="w-40 h-2 bg-zinc-700 rounded-full"></div>
                          </div>
                          <div className="w-24 h-2 bg-zinc-800 rounded-full"></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Social Proof */}
        <section className="py-20 border-y border-zinc-800/30 bg-[#0A0A12]">
          <div className="max-w-7xl mx-auto px-6">
            <p className="text-center text-xs font-mono uppercase tracking-[0.3em] text-zinc-500 mb-12">
              Empowering the most elite brokerage teams across the US
            </p>
            <div className="flex flex-wrap justify-center items-center gap-x-16 gap-y-8 opacity-40 grayscale hover:grayscale-0 transition-all">
              <div className="text-2xl font-bold text-white tracking-tighter">ENGIE</div>
              <div className="text-2xl font-bold text-white tracking-tighter">NRG</div>
              <div className="text-2xl font-bold text-white tracking-tighter">EXXONMOBIL</div>
              <div className="text-2xl font-bold text-white tracking-tighter">SHELL</div>
              <div className="text-2xl font-bold text-white tracking-tighter">CONSTELLATION</div>
            </div>
          </div>
        </section>

        {/* Value Propositions */}
        <section id="features" className="py-32 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-24">
              <h2 className="text-3xl md:text-5xl font-bold mb-6">Everything you need to <br/> scale your brokerage.</h2>
              <p className="text-zinc-400 max-w-xl mx-auto">One single platform for data enrichment, forensic analysis, and automated outreach. Built by brokers, for brokers.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-blue-500/50 transition-colors group">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Zap className="w-6 h-6 text-blue-500" />
                </div>
                <h3 className="text-xl font-bold mb-4">Targeted Prospecting</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">
                  Access 10M+ commercial accounts with energy-specific metadata. Filter by load factor, meter count, and current contract status.
                </p>
              </div>

              <div className="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-blue-500/50 transition-colors group">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <BarChart3 className="w-6 h-6 text-blue-500" />
                </div>
                <h3 className="text-xl font-bold mb-4">Forensic Proof</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">
                  Walk into meetings with proof. Identify cost leakage and thermal liability automatically to give you instant credibility with any CFO.
                </p>
              </div>

              <div className="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-blue-500/50 transition-colors group">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Users className="w-6 h-6 text-blue-500" />
                </div>
                <h3 className="text-xl font-bold mb-4">Automated Sequences</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">
                  Scale your outreach without losing the personal touch. Multi-channel sequences designed for the high-trust world of energy consulting.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-32 bg-blue-600 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/10 to-transparent" />
          <div className="max-w-7xl mx-auto px-6 relative z-10 flex flex-col items-center">
            <h2 className="text-4xl md:text-6xl font-black text-white mb-16 text-center leading-tight">The data that fuels <br/> the top 1% of brokers.</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-12 w-full max-w-5xl">
              <div className="text-center">
                <div className="text-5xl font-black text-white mb-2">10M+</div>
                <div className="text-blue-100 text-sm font-bold uppercase tracking-widest">Accounts</div>
              </div>
              <div className="text-center">
                <div className="text-5xl font-black text-white mb-2">250M+</div>
                <div className="text-blue-100 text-sm font-bold uppercase tracking-widest">Meters</div>
              </div>
              <div className="text-center">
                <div className="text-5xl font-black text-white mb-2">99.9%</div>
                <div className="text-blue-100 text-sm font-bold uppercase tracking-widest">Accuracy</div>
              </div>
              <div className="text-center">
                <div className="text-5xl font-black text-white mb-2">$500M+</div>
                <div className="text-blue-100 text-sm font-bold uppercase tracking-widest">Broker Revenue</div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-24 pb-12 px-6 border-t border-zinc-800/50">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-12 mb-20">
              <div className="col-span-2">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center p-1.5">
                    <Image src="/images/nodalpoint.png" alt="Nodal Point" width={20} height={20} />
                  </div>
                  <span className="font-bold text-xl tracking-tight text-white">Nodal Point</span>
                </div>
                <p className="text-zinc-500 text-sm max-w-xs leading-relaxed">
                  The first high-fidelity intelligence platform built for commercial energy consultants and brokers.
                </p>
              </div>
              <div>
                <h4 className="text-white font-bold mb-6">Product</h4>
                <ul className="space-y-4 text-sm text-zinc-500">
                  <li><Link href="#" className="hover:text-blue-500">Prospecting</Link></li>
                  <li><Link href="#" className="hover:text-blue-500">Forensics</Link></li>
                  <li><Link href="#" className="hover:text-blue-500">Sequences</Link></li>
                  <li><Link href="#" className="hover:text-blue-500">For Brokers</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-bold mb-6">Company</h4>
                <ul className="space-y-4 text-sm text-zinc-500">
                  <li><Link href="#" className="hover:text-blue-500">About</Link></li>
                  <li><Link href="#" className="hover:text-blue-500">Blog</Link></li>
                  <li><Link href="#" className="hover:text-blue-500">Careers</Link></li>
                  <li><Link href="#" className="hover:text-blue-500">Contact</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-bold mb-6">Legal</h4>
                <ul className="space-y-4 text-sm text-zinc-500">
                  <li><Link href="#" className="hover:text-blue-500">Privacy</Link></li>
                  <li><Link href="#" className="hover:text-blue-500">Terms</Link></li>
                  <li><Link href="#" className="hover:text-blue-500">Security</Link></li>
                </ul>
              </div>
            </div>
            <div className="pt-12 border-t border-zinc-800/30 flex flex-col md:flex-row justify-between items-center gap-6">
              <p className="text-xs text-zinc-600 font-mono tracking-widest uppercase">
                &copy; 2026 Nodal Point. The only platform for energy brokers.
              </p>
              <div className="flex gap-6">
                <Link href="#" className="text-zinc-500 hover:text-white"><Globe className="w-5 h-5" /></Link>
                <Link href="#" className="text-zinc-500 hover:text-white"><Shield className="w-5 h-5" /></Link>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}

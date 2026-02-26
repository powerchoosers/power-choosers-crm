'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { AccountDossierHeader } from '@/components/dossier/account-dossier/AccountDossierHeader'
import { AccountPhysicsPanel } from '@/components/dossier/account-dossier/AccountPhysicsPanel'
import { AccountInfrastructurePanel } from '@/components/dossier/account-dossier/AccountInfrastructurePanel'
import { AccountNetworkPanel } from '@/components/dossier/account-dossier/AccountNetworkPanel'
import { useAccountDossierState } from '@/hooks/useAccountDossierState'

interface AccountDossierClientProps {
    id: string
    initialData?: {
        account: any
        contacts: any[]
        calls: any[]
        tasks: any[]
    }
}

export default function AccountDossierClient({ id, initialData }: AccountDossierClientProps) {
    const router = useRouter()
    const state = useAccountDossierState(id, initialData)

    // Note: We'll eventually integrate initialData into useAccountDossierState 
    // to prevent the initial "loading" state flickers.

    if (!state.account && state.isLoading && !initialData) {
        return (
            <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center space-y-4 animate-in fade-in duration-500">
                <div className="font-mono text-zinc-500">INITIALIZING NEURAL LINK...</div>
            </div>
        )
    }

    const account = state.account || initialData?.account

    if (!account) {
        return (
            <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center gap-4 animate-in fade-in duration-500">
                <div className="font-mono text-zinc-500">ACCOUNT_NOT_FOUND</div>
                <button className="icon-button-forensic" onClick={() => router.back()}>Return to Grid</button>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex-1 nodal-void-card overflow-hidden flex flex-col relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#002FA7]/10 blur-[120px] rounded-full pointer-events-none" />

                <AccountDossierHeader
                    account={account}
                    isEditing={state.isEditing}
                    toggleEditing={state.toggleEditing}
                    showSynced={state.showSynced}
                    recentlyUpdatedFields={state.recentlyUpdatedFields}
                    editAccountName={state.editAccountName}
                    setEditAccountName={state.setEditAccountName}
                    editIndustry={state.editIndustry}
                    setEditIndustry={state.setEditIndustry}
                    editLocation={state.editLocation}
                    setEditLocation={state.setEditLocation}
                    editLogoUrl={state.editLogoUrl}
                    setEditLogoUrl={state.setEditLogoUrl}
                    editDomain={state.editDomain}
                    setEditDomain={state.setEditDomain}
                    editLinkedinUrl={state.editLinkedinUrl}
                    setEditLinkedinUrl={state.setEditLinkedinUrl}
                    activeEditField={state.activeEditField}
                    setActiveEditField={state.setActiveEditField}
                    hasTasks={state.hasTasks}
                    pendingTasks={state.pendingTasks}
                    displayTaskIndex={state.displayTaskIndex}
                    globalTotal={state.globalTotal}
                    globalPosition={state.globalPosition}
                    useGlobalPagination={state.useGlobalPagination}
                    handlePrev={state.handlePrev}
                    handleNext={state.handleNext}
                    handleCompleteAndAdvance={state.handleCompleteAndAdvance}
                />

                <div className="flex-1 flex overflow-hidden relative z-10 group/dossier">
                    <div className="grid grid-cols-12 w-full h-full">
                        <AccountPhysicsPanel
                            account={account}
                            isEditing={state.isEditing}
                            isRecalibrating={state.isRecalibrating}
                            recentlyUpdatedFields={state.recentlyUpdatedFields}
                            glowingFields={state.glowingFields}
                            editCompanyPhone={state.editCompanyPhone}
                            setEditCompanyPhone={state.setEditCompanyPhone}
                            editDomain={state.editDomain}
                            setEditDomain={state.setEditDomain}
                            editAddress={state.editAddress}
                            setEditAddress={state.setEditAddress}
                            editLogoUrl={state.editLogoUrl}
                            editContractEnd={state.editContractEnd}
                            setEditContractEnd={state.setEditContractEnd}
                            editStrikePrice={state.editStrikePrice}
                            setEditStrikePrice={state.setEditStrikePrice}
                            editAnnualUsage={state.editAnnualUsage}
                            setEditAnnualUsage={state.setEditAnnualUsage}
                            contractEndDate={state.contractEndDate}
                            daysRemaining={state.daysRemaining}
                            maturityPct={state.maturityPct}
                            maturityColor={state.maturityColor}
                        />

                        <div className="col-span-12 lg:col-span-4 border-l border-white/5 flex flex-col overflow-hidden">
                            <AccountInfrastructurePanel
                                id={id}
                                account={account}
                                isEditing={state.isEditing}
                                editNotes={state.editNotes}
                                setEditNotes={state.setEditNotes}
                                editMeters={state.editMeters}
                                setEditMeters={state.setEditMeters}
                                handleIngestionComplete={state.handleIngestionComplete}
                                updateAccountMutation={state.updateAccountMutation}
                            />
                            <AccountNetworkPanel
                                id={id}
                                account={account}
                                contacts={state.contacts || initialData?.contacts || []}
                                calls={state.calls || initialData?.calls || []}
                                isLoadingCalls={state.isLoadingCalls}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

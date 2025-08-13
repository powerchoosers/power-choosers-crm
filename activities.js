// Power Choosers CRM Dashboard - Activities Module
// This module contains all activities functionality

// Extend CRMApp with activities functions
Object.assign(CRMApp, {
    // Render the activities page
    renderActivitiesPage() {
        console.log("renderActivitiesPage called");
        const activitiesView = document.getElementById('activities-view');
        if (!activitiesView) {
            console.error('activities-view element not found');
            return;
        }

        const activitiesHTML = `
            <div class="activities-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #333;">
                <h2 style="margin: 0; color: #fff; font-size: 28px; font-weight: 600;">Activities</h2>
                <button onclick="CRMApp.createNewActivity()" style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); border: 1px solid #28a745; color: #fff; padding: 12px 24px; border-radius: 8px; cursor: pointer;">
                    Log Activity
                </button>
            </div>

            <div class="activities-content" style="background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%); border-radius: 18px; border: 1px solid #333; padding: 20px; flex: 1;">
                <div style="display: flex; gap: 15px; margin-bottom: 20px;">
                    <select id="activity-type-filter" style="padding: 10px 15px; background: #333; color: #fff; border: 1px solid #555; border-radius: 8px;">
                        <option value="">All Types</option>
                        <option value="call">Calls</option>
                        <option value="email">Emails</option>
                        <option value="meeting">Meetings</option>
                        <option value="task">Tasks</option>
                    </select>
                    <input type="text" id="activity-search" placeholder="Search activities..." style="padding: 10px 15px; background: #333; color: #fff; border: 1px solid #555; border-radius: 8px; min-width: 300px;">
                    <div id="activities-count" style="color: #ccc; margin-left: auto; padding: 10px;">Loading activities...</div>
                </div>

                <div id="activities-list" style="max-height: 600px; overflow-y: auto;">
                </div>
            </div>
        `;

        activitiesView.innerHTML = activitiesHTML;
        activitiesView.style.cssText = `display: flex !important; flex-direction: column !important; height: calc(100vh - 120px) !important; background: #1a1a1a !important; color: #fff !important; margin-top: 32px !important; padding: 20px !important; border-radius: 20px !important;`;

        this.initActivitiesData();
        this.renderActivitiesList();
    },

    initActivitiesData() {
        if (!this.activities || this.activities.length === 0) {
            this.activities = this.generateSampleActivities();
        }
    },

    generateSampleActivities() {
        return [
            {
                id: 'act1',
                type: 'call',
                description: 'Follow-up call with ABC Energy Corp',
                contactName: 'John Smith',
                accountName: 'ABC Energy Corp',
                createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
                duration: '15 minutes'
            },
            {
                id: 'act2',
                type: 'email',
                description: 'Sent proposal to XYZ Power Solutions',
                contactName: 'Sarah Johnson',
                accountName: 'XYZ Power Solutions',
                createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000)
            },
            {
                id: 'act3',
                type: 'meeting',
                description: 'Demo scheduled with Green Energy Inc',
                contactName: 'Mike Davis',
                accountName: 'Green Energy Inc',
                createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
            }
        ];
    },

    renderActivitiesList() {
        const activitiesList = document.getElementById('activities-list');
        const activitiesCount = document.getElementById('activities-count');
        
        if (!activitiesList || !activitiesCount) return;
        
        activitiesCount.textContent = `${this.activities.length} activit${this.activities.length !== 1 ? 'ies' : 'y'}`;
        activitiesList.innerHTML = '';
        
        this.activities.forEach(activity => {
            const activityElement = document.createElement('div');
            activityElement.style.cssText = `
                background: #333; border-radius: 8px; padding: 15px; margin-bottom: 10px;
                border-left: 4px solid ${this.getActivityColor(activity.type)};
            `;
            
            activityElement.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <div style="font-weight: 600; color: #fff; margin-bottom: 5px;">${activity.description}</div>
                        <div style="color: #ccc; font-size: 14px;">${activity.contactName} - ${activity.accountName}</div>
                        <div style="color: #999; font-size: 12px; margin-top: 5px;">${activity.createdAt.toLocaleString()}</div>
                    </div>
                    <span style="background: ${this.getActivityColor(activity.type)}; color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px; text-transform: uppercase;">
                        ${activity.type}
                    </span>
                </div>
            `;
            
            activitiesList.appendChild(activityElement);
        });
    },

    getActivityColor(type) {
        const colors = {
            call: '#28a745',
            email: '#007bff',
            meeting: '#ffc107',
            task: '#dc3545'
        };
        return colors[type] || '#6c757d';
    },

    createNewActivity() {
        this.showNotification('Create New Activity modal would open here', 'info');
    }
});

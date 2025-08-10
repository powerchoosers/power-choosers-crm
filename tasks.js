// Power Choosers CRM Dashboard - Tasks Module
// This module contains all task management functionality

// Extend CRMApp with tasks functions
Object.assign(CRMApp, {
    // Render the tasks page with tabbed interface and pagination
    renderTasksPage() {
        console.log("renderTasksPage called");
        const tasksView = document.getElementById('tasks-view');
        if (!tasksView) {
            console.error('tasks-view element not found');
            return;
        }

        console.log("Creating tasks HTML with tabs and pagination");
        const tasksHTML = `
            <div class="tasks-header" style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 24px;
                padding-bottom: 16px;
                border-bottom: 1px solid #333;
            ">
                <h2 style="
                    margin: 0;
                    color: #fff;
                    font-size: 28px;
                    font-weight: 600;
                    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
                ">All Tasks</h2>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <button onclick="CRMApp.openSequences()" style="
                        background: linear-gradient(135deg, #3a3a3a 0%, #2d2d2d 100%);
                        border: 1px solid #444;
                        color: #fff;
                        padding: 10px 20px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 600;
                        transition: all 0.2s ease;
                        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                    " onmouseover="this.style.background='linear-gradient(135deg, #4a4a4a 0%, #3a3a3a 100%)'" 
                       onmouseout="this.style.background='linear-gradient(135deg, #3a3a3a 0%, #2d2d2d 100%)'">
                        Sequences
                    </button>
                    <button onclick="CRMApp.openAddTaskModal()" style="
                        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                        border: 1px solid #28a745;
                        color: #fff;
                        padding: 10px 20px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 600;
                        transition: all 0.2s ease;
                        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    " onmouseover="this.style.background='linear-gradient(135deg, #218838 0%, #1e7e34 100%)'" 
                       onmouseout="this.style.background='linear-gradient(135deg, #28a745 0%, #20c997 100%)'">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        Add Task
                    </button>
                </div>
            </div>

            <!-- Task Type Tabs -->
            <div class="task-tabs" style="
                display: flex;
                gap: 4px;
                margin-bottom: 20px;
                background: #2a2a2a;
                padding: 4px;
                border-radius: 12px;
                border: 1px solid #333;
            ">
                <button id="all-tasks-tab" class="task-tab active-tab" onclick="CRMApp.switchTaskTab('all')" style="
                    flex: 1;
                    padding: 12px 20px;
                    background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
                    color: #fff;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                    transition: all 0.2s ease;
                    position: relative;
                ">
                    All Tasks
                    <span id="all-count" style="
                        background: rgba(255, 255, 255, 0.2);
                        padding: 2px 8px;
                        border-radius: 12px;
                        font-size: 12px;
                        margin-left: 8px;
                    ">0</span>
                </button>
                <button id="pending-tasks-tab" class="task-tab" onclick="CRMApp.switchTaskTab('pending')" style="
                    flex: 1;
                    padding: 12px 20px;
                    background: transparent;
                    color: #ccc;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                    transition: all 0.2s ease;
                ">
                    Pending
                    <span id="pending-count" style="
                        background: rgba(255, 255, 255, 0.1);
                        padding: 2px 8px;
                        border-radius: 12px;
                        font-size: 12px;
                        margin-left: 8px;
                    ">0</span>
                </button>
                <button id="completed-tasks-tab" class="task-tab" onclick="CRMApp.switchTaskTab('completed')" style="
                    flex: 1;
                    padding: 12px 20px;
                    background: transparent;
                    color: #ccc;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                    transition: all 0.2s ease;
                ">
                    Completed
                    <span id="completed-count" style="
                        background: rgba(255, 255, 255, 0.1);
                        padding: 2px 8px;
                        border-radius: 12px;
                        font-size: 12px;
                        margin-left: 8px;
                    ">0</span>
                </button>
            </div>

            <div class="tasks-content" style="
                background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                border-radius: 18px;
                border: 1px solid #333;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                padding: 20px;
                flex: 1;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            ">
                <div style="
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    margin-bottom: 20px;
                    flex-shrink: 0;
                ">
                    <input type="text" id="task-search" placeholder="Search tasks..." style="
                        padding: 10px 15px;
                        background: #333;
                        color: #fff;
                        border: 1px solid #555;
                        border-radius: 8px;
                        font-size: 14px;
                        min-width: 300px;
                    ">
                    <button onclick="CRMApp.clearTasksFilters()" style="
                        background: #666;
                        border: 1px solid #777;
                        color: #fff;
                        padding: 10px 15px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 14px;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.background='#777'" onmouseout="this.style.background='#666'">
                        Clear
                    </button>
                    <div id="tasks-count" style="
                        color: #ccc;
                        font-size: 14px;
                        margin-left: auto;
                    ">Loading tasks...</div>
                </div>

                <div id="tasks-table-container" style="
                    flex: 1;
                    overflow-x: auto;
                    overflow-y: auto;
                    border-radius: 12px;
                    min-height: 0;
                ">
                    <table id="tasks-table" style="
                        width: 100%;
                        border-collapse: collapse;
                        background: linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%);
                        border-radius: 12px;
                        overflow: hidden;
                        border: 1px solid #444;
                    ">
                        <thead>
                            <tr style="
                                background: linear-gradient(135deg, #444 0%, #333 100%);
                                border-bottom: 2px solid #555;
                            ">
                                <th style="padding: 15px; text-align: left; font-weight: 600; color: #fff; font-size: 14px;">Task</th>
                                <th style="padding: 15px; text-align: left; font-weight: 600; color: #fff; font-size: 14px;">Type</th>
                                <th style="padding: 15px; text-align: left; font-weight: 600; color: #fff; font-size: 14px;">Priority</th>
                                <th style="padding: 15px; text-align: left; font-weight: 600; color: #fff; font-size: 14px;">Due Date</th>
                                <th style="padding: 15px; text-align: left; font-weight: 600; color: #fff; font-size: 14px;">Status</th>
                                <th style="padding: 15px; text-align: left; font-weight: 600; color: #fff; font-size: 14px;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="tasks-table-body">
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        tasksView.innerHTML = tasksHTML;
        
        // Apply layout styles
        tasksView.style.cssText = `
            display: flex !important;
            flex-direction: column !important;
            height: calc(100vh - 120px) !important;
            background: #1a1a1a !important;
            color: #fff !important;
            margin-top: 32px !important;
            padding: 20px !important;
            border-radius: 20px !important;
            overflow: hidden !important;
        `;

        // Initialize tasks functionality
        this.initSimpleTasksUI();
    },

    // Tasks page functionality
    initSimpleTasksUI() {
        console.log("Initializing simple tasks UI");
        
        // Initialize tasks data if not present
        if (!this.tasks || this.tasks.length === 0) {
            this.tasks = this.generateSampleTasks();
        }
        
        // Initialize pagination
        this.currentTasksPage = 1;
        this.currentTaskType = 'all';
        
        // Render initial tasks table
        this.renderSimpleTasksTable();
        
        // Update task counts in tabs
        this.updateTaskCounts();
        
        // Setup event listeners
        const searchInput = document.getElementById('task-search');
        if (searchInput) {
            searchInput.addEventListener('input', debounce((e) => {
                this.renderSimpleTasksTable(e.target.value);
            }, 300));
        }
    },

    generateSampleTasks() {
        const taskTypes = ['call', 'email', 'linkedin'];
        const priorities = ['high', 'medium', 'low'];
        const statuses = ['pending', 'in-progress', 'completed'];
        const sampleTasks = [];

        // Generate sample tasks based on existing contacts and accounts
        const contacts = this.contacts || [];
        const accounts = this.accounts || [];

        for (let i = 0; i < 25; i++) {
            const taskType = taskTypes[Math.floor(Math.random() * taskTypes.length)];
            const priority = priorities[Math.floor(Math.random() * priorities.length)];
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            const contact = contacts[Math.floor(Math.random() * contacts.length)];
            const account = accounts[Math.floor(Math.random() * accounts.length)];
            
            // Create due date (random between now and 30 days from now)
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 30));
            
            sampleTasks.push({
                id: `task_${i + 1}`,
                title: this.generateTaskTitle(taskType, contact, account),
                type: taskType,
                priority: priority,
                status: status,
                dueDate: dueDate,
                contactId: contact?.id || null,
                contactName: contact ? `${contact.firstName} ${contact.lastName}` : null,
                accountId: account?.id || null,
                accountName: account?.name || null,
                completed: status === 'completed',
                createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) // Random date within last week
            });
        }

        return sampleTasks;
    },

    generateTaskTitle(type, contact, account) {
        const contactName = contact ? `${contact.firstName} ${contact.lastName}` : 'Contact';
        const accountName = account ? account.name : 'Company';
        
        const templates = {
            call: [
                `Follow up call with ${contactName}`,
                `Discovery call - ${accountName}`,
                `Check in with ${contactName} at ${accountName}`,
                `Schedule demo for ${accountName}`
            ],
            email: [
                `Send proposal to ${contactName}`,
                `Follow up email - ${accountName}`,
                `Send contract to ${contactName}`,
                `Share case study with ${accountName}`
            ],
            linkedin: [
                `Connect with ${contactName} on LinkedIn`,
                `Send LinkedIn message to ${contactName}`,
                `Engage with ${accountName} posts`,
                `Share content with ${contactName}`
            ]
        };
        
        const typeTemplates = templates[type] || templates.call;
        return typeTemplates[Math.floor(Math.random() * typeTemplates.length)];
    },

    switchTaskTab(taskType) {
        console.log(`Switching to task tab: ${taskType}`);
        this.currentTaskType = taskType;
        
        // Update tab appearance
        document.querySelectorAll('.task-tab').forEach(tab => {
            tab.style.background = 'transparent';
            tab.style.color = '#ccc';
        });
        
        const activeTab = document.getElementById(`${taskType}-tasks-tab`);
        if (activeTab) {
            activeTab.style.background = 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)';
            activeTab.style.color = '#fff';
        }
        
        // Re-render table with filtered tasks
        this.renderSimpleTasksTable();
    },

    renderSimpleTasksTable(searchTerm = '', tasksToRender = null) {
        const tableBody = document.getElementById('tasks-table-body');
        const tasksCount = document.getElementById('tasks-count');
        
        if (!tableBody || !tasksCount) return;
        
        // Use provided tasks or filter from all tasks
        let filteredTasks = tasksToRender || this.getFilteredTasks();
        
        // Apply search filter
        if (searchTerm) {
            filteredTasks = filteredTasks.filter(task => {
                const searchableText = `${task.title} ${task.type} ${task.contactName} ${task.accountName}`.toLowerCase();
                return searchableText.includes(searchTerm.toLowerCase());
            });
        }
        
        // Update tasks count
        tasksCount.textContent = `${filteredTasks.length} task${filteredTasks.length !== 1 ? 's' : ''}`;
        
        // Clear existing rows
        tableBody.innerHTML = '';
        
        if (filteredTasks.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="
                        padding: 40px;
                        text-align: center;
                        color: #999;
                        font-style: italic;
                    ">No tasks found</td>
                </tr>
            `;
            return;
        }
        
        // Render task rows
        filteredTasks.forEach(task => {
            const row = document.createElement('tr');
            row.style.cssText = `
                border-bottom: 1px solid #333;
                transition: background-color 0.2s ease;
                cursor: pointer;
            `;
            row.onmouseover = () => row.style.backgroundColor = '#2a2a2a';
            row.onmouseout = () => row.style.backgroundColor = 'transparent';
            
            const priorityColor = {
                high: '#dc3545',
                medium: '#ffc107',
                low: '#28a745'
            }[task.priority] || '#6c757d';
            
            const statusColor = {
                pending: '#ffc107',
                'in-progress': '#007bff',
                completed: '#28a745'
            }[task.status] || '#6c757d';
            
            row.innerHTML = `
                <td style="padding: 15px; color: #fff;">
                    <div style="font-weight: 600; margin-bottom: 4px;">${task.title}</div>
                    <div style="font-size: 12px; color: #999;">
                        ${task.contactName ? `Contact: ${task.contactName}` : ''}
                        ${task.accountName ? ` • ${task.accountName}` : ''}
                    </div>
                </td>
                <td style="padding: 15px; color: #ccc; text-transform: capitalize;">${task.type}</td>
                <td style="padding: 15px;">
                    <span style="
                        background: ${priorityColor};
                        color: white;
                        padding: 4px 8px;
                        border-radius: 12px;
                        font-size: 12px;
                        font-weight: 600;
                        text-transform: capitalize;
                    ">${task.priority}</span>
                </td>
                <td style="padding: 15px; color: #ccc;">${task.dueDate.toLocaleDateString()}</td>
                <td style="padding: 15px;">
                    <span style="
                        background: ${statusColor};
                        color: white;
                        padding: 4px 8px;
                        border-radius: 12px;
                        font-size: 12px;
                        font-weight: 600;
                        text-transform: capitalize;
                    ">${task.status.replace('-', ' ')}</span>
                </td>
                <td style="padding: 15px;">
                    <div style="display: flex; gap: 8px;">
                        ${!task.completed ? `
                            <button onclick="CRMApp.completeTask('${task.id}')" style="
                                background: #28a745;
                                border: none;
                                color: white;
                                padding: 6px 12px;
                                border-radius: 4px;
                                cursor: pointer;
                                font-size: 12px;
                                transition: background-color 0.2s ease;
                            " onmouseover="this.style.backgroundColor='#1e7e34'" 
                               onmouseout="this.style.backgroundColor='#28a745'">
                                Complete
                            </button>
                        ` : ''}
                        <button onclick="CRMApp.editTask('${task.id}')" style="
                            background: #007bff;
                            border: none;
                            color: white;
                            padding: 6px 12px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                            transition: background-color 0.2s ease;
                        " onmouseover="this.style.backgroundColor='#0056b3'" 
                           onmouseout="this.style.backgroundColor='#007bff'">
                            Edit
                        </button>
                    </div>
                </td>
            `;
            
            tableBody.appendChild(row);
        });
    },

    updateTaskCounts() {
        const allCount = this.tasks.length;
        const pendingCount = this.tasks.filter(t => t.status === 'pending').length;
        const completedCount = this.tasks.filter(t => t.completed).length;
        
        const allCountEl = document.getElementById('all-count');
        const pendingCountEl = document.getElementById('pending-count');
        const completedCountEl = document.getElementById('completed-count');
        
        if (allCountEl) allCountEl.textContent = allCount;
        if (pendingCountEl) pendingCountEl.textContent = pendingCount;
        if (completedCountEl) completedCountEl.textContent = completedCount;
    },

    getFilteredTasks() {
        switch (this.currentTaskType) {
            case 'pending':
                return this.tasks.filter(t => t.status === 'pending');
            case 'completed':
                return this.tasks.filter(t => t.completed);
            default:
                return this.tasks;
        }
    },

    clearTasksFilters() {
        const searchInput = document.getElementById('task-search');
        if (searchInput) searchInput.value = '';
        this.renderSimpleTasksTable();
    },

    completeTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = true;
            task.status = 'completed';
            this.showNotification(`Task "${task.title}" marked as completed!`, 'success');
            this.updateTaskCounts();
            this.renderSimpleTasksTable();
        }
    },

    editTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            this.showNotification(`Editing task: ${task.title}`, 'info');
            // Implement task editing modal here
        }
    },

    openAddTaskModal() {
        this.showNotification('Add Task modal would open here', 'info');
        // Implement add task modal here
    },

    // Open sequences functionality
    openSequences() {
        this.showView('sequences-view');
    }
});

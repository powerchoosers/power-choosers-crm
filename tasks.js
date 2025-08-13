// Power Choosers CRM Dashboard - Tasks Module
// This module contains all task management functionality

// Extend CRMApp with tasks functions
Object.assign(CRMApp, {
    // Render the tasks page with tabbed interface and pagination
    renderTasksPage() {
        console.log('renderTasksPage called');
        const tasksView = document.getElementById('tasks-view');
        if (!tasksView) {
            console.error('tasks-view element not found');
            return;
        }

        const tasksHTML = `
          <div class="tasks-layout">
            <div class="tasks-header">
              <div class="title-with-icon">
                <span class="title-icon">
                  <!-- Tasks/checklist icon (stroke-based to inherit white) -->
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <path d="M9 12l2 2 4-4"></path>
                  </svg>
                </span>
                <span>All Tasks</span>
              </div>
              <div class="tasks-actions-right">
                <button class="btn" onclick="CRMApp.openSequences()">Sequences</button>
                <button class="btn btn-primary" onclick="CRMApp.openAddTaskModal()">Add Task</button>
              </div>
            </div>

            <div class="tasks-toolbar">
              <div class="task-tabs">
                <button id="all-tasks-tab" class="task-tab active" onclick="CRMApp.switchTaskTab('all')">All <span id="all-count" class="tab-count">0</span></button>
                <button id="pending-tasks-tab" class="task-tab" onclick="CRMApp.switchTaskTab('pending')">Pending <span id="pending-count" class="tab-count">0</span></button>
                <button id="completed-tasks-tab" class="task-tab" onclick="CRMApp.switchTaskTab('completed')">Completed <span id="completed-count" class="tab-count">0</span></button>
              </div>
              <div class="tasks-search">
                <input id="tasks-search-input" type="text" placeholder="Search tasks..."/>
              </div>
              <div class="tasks-toolbar-actions">
                <button id="tasks-clear-filters" class="btn">Clear</button>
                <div id="tasks-count" class="tasks-count">Loading tasks...</div>
              </div>
            </div>

            <div class="tasks-table-container">
              <div class="tasks-table-wrapper">
                <table class="tasks-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Type</th>
                      <th>Priority</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="tasks-table-body"></tbody>
                </table>
              </div>
              <div id="tasks-pagination" class="tasks-pagination">
                <div class="left">
                  <span id="tasks-pagination-info">—</span>
                </div>
                <div class="right">
                  <div class="pagination-controls">
                    <button id="tasks-prev-page" class="pagination-btn" title="Previous" aria-label="Previous">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="15 18 9 12 15 6"></polyline>
                      </svg>
                    </button>
                    <div id="tasks-pagination-numbers" class="pagination-numbers"></div>
                    <button id="tasks-next-page" class="pagination-btn" title="Next" aria-label="Next">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;

        tasksView.innerHTML = tasksHTML;
        this.initSimpleTasksUI();
    },

    // Tasks page functionality
    initSimpleTasksUI() {
        console.log('Initializing simple tasks UI');

        // Initialize tasks data if not present
        if (!this.tasks || this.tasks.length === 0) {
            this.tasks = this.generateSampleTasks();
        }

        // Initialize pagination and state
        this.tasksPageSize = this.tasksPageSize || 10;
        this.currentTasksPage = 1;
        this.currentTaskType = 'all';

        // Render initial
        this.renderSimpleTasksTable();
        this.updateTaskCounts();

        // Setup event listeners
        const searchInput = document.getElementById('tasks-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', debounce((e) => {
                this.currentTasksPage = 1;
                this.renderSimpleTasksTable(e.target.value);
            }, 300));
        }
        const clearBtn = document.getElementById('tasks-clear-filters');
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearTasksFilters());
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
        this.currentTasksPage = 1;

        // Update tab appearance via class
        document.querySelectorAll('.task-tab').forEach(tab => tab.classList.remove('active'));
        const activeTab = document.getElementById(`${taskType}-tasks-tab`);
        if (activeTab) activeTab.classList.add('active');

        // Re-render table with filtered tasks
        this.renderSimpleTasksTable(document.getElementById('tasks-search-input')?.value || '');
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
                const searchableText = `${task.title} ${task.type} ${task.contactName || ''} ${task.accountName || ''}`.toLowerCase();
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

        // Pagination math
        const total = filteredTasks.length;
        const pageSize = this.tasksPageSize || 10;
        const pages = Math.max(1, Math.ceil(total / pageSize));
        if (this.currentTasksPage > pages) this.currentTasksPage = pages;
        const page = Math.max(1, this.currentTasksPage || 1);
        const start = (page - 1) * pageSize;
        const end = Math.min(start + pageSize, total);
        const paginated = filteredTasks.slice(start, end);

        // Update count
        tasksCount.textContent = `${total} tasks`;

        // Render task rows
        paginated.forEach(task => {
            const row = document.createElement('tr');
            row.className = 'task-row';
            row.onclick = () => this.openTaskDrawer(task.id);

            const due = task.dueDate instanceof Date ? task.dueDate.toLocaleDateString() : (task.dueDate || '—');
            const priorityClass = `priority-${(task.priority || 'low').toLowerCase()}`;
            const statusClass = `status-${(task.status || 'pending').toLowerCase()}`;

            row.innerHTML = `
              <td class="col-task">
                <div class="title">${task.title}</div>
                <div class="sub">${task.contactName || 'Unknown Contact'} • ${task.accountName || 'Unknown Account'}</div>
              </td>
              <td class="col-type">${task.type || 'task'}</td>
              <td class="col-priority"><span class="badge ${priorityClass}">${task.priority || 'low'}</span></td>
              <td class="col-due">${due}</td>
              <td class="col-status"><span class="badge ${statusClass}">${task.status || 'pending'}</span></td>
              <td class="row-actions">
                <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); CRMApp.completeTask('${task.id}')">Complete</button>
                <button class="btn btn-sm" onclick="event.stopPropagation(); CRMApp.editTask('${task.id}')">Edit</button>
              </td>
            `;
            tableBody.appendChild(row);
        });

        // Pagination controls
        this.renderTasksPagination(total, page, pageSize);
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
        const searchInput = document.getElementById('tasks-search-input');
        if (searchInput) searchInput.value = '';
        this.currentTasksPage = 1;
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
    },

    // Pagination renderer
    renderTasksPagination(total, page, pageSize) {
        const info = document.getElementById('tasks-pagination-info');
        const numbers = document.getElementById('tasks-pagination-numbers');
        const prevBtn = document.getElementById('tasks-prev-page');
        const nextBtn = document.getElementById('tasks-next-page');
        if (!info || !numbers || !prevBtn || !nextBtn) return;

        const pages = Math.max(1, Math.ceil(total / pageSize));
        const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
        const endItem = Math.min(page * pageSize, total);
        info.textContent = `${startItem}-${endItem} of ${total}`;

        // Controls state
        prevBtn.disabled = page <= 1;
        nextBtn.disabled = page >= pages;

        // Build numbers (simple 1..pages)
        numbers.innerHTML = '';
        const maxButtons = 7;
        let startPage = Math.max(1, page - 3);
        let endPage = Math.min(pages, startPage + maxButtons - 1);
        if (endPage - startPage + 1 < maxButtons) startPage = Math.max(1, endPage - maxButtons + 1);

        const makeBtn = (p) => {
            const b = document.createElement('button');
            b.className = 'page-num';
            if (p === page) b.classList.add('active');
            b.textContent = String(p);
            b.addEventListener('click', () => {
                this.currentTasksPage = p;
                this.renderSimpleTasksTable(document.getElementById('tasks-search-input')?.value || '');
            });
            return b;
        };

        if (startPage > 1) {
            numbers.appendChild(makeBtn(1));
            if (startPage > 2) {
                const ell = document.createElement('span');
                ell.className = 'page-ellipsis';
                ell.textContent = '…';
                numbers.appendChild(ell);
            }
        }
        for (let p = startPage; p <= endPage; p++) numbers.appendChild(makeBtn(p));
        if (endPage < pages) {
            if (endPage < pages - 1) {
                const ell = document.createElement('span');
                ell.className = 'page-ellipsis';
                ell.textContent = '…';
                numbers.appendChild(ell);
            }
            numbers.appendChild(makeBtn(pages));
        }

        // Prev/Next
        prevBtn.onclick = () => {
            if (this.currentTasksPage > 1) {
                this.currentTasksPage--;
                this.renderSimpleTasksTable(document.getElementById('tasks-search-input')?.value || '');
            }
        };
        nextBtn.onclick = () => {
            if (this.currentTasksPage < pages) {
                this.currentTasksPage++;
                this.renderSimpleTasksTable(document.getElementById('tasks-search-input')?.value || '');
            }
        };
    },

    // --- Task Detail Drawer ---
    ensureTaskDrawer() {
        if (document.getElementById('task-drawer')) return;
        const drawer = document.createElement('div');
        drawer.id = 'task-drawer';
        drawer.className = 'task-drawer';
        drawer.innerHTML = `
          <div class="task-drawer-header">
            <div class="title-area">
              <div class="pill" id="task-drawer-type">Task</div>
              <h3 id="task-drawer-title">—</h3>
            </div>
            <div class="header-actions">
              <button class="icon-btn" id="task-drawer-close" title="Close">×</button>
            </div>
          </div>
          <div class="task-drawer-body">
            <div class="task-left" id="task-left"></div>
            <div class="task-right" id="task-right"></div>
          </div>
        `;
        document.body.appendChild(drawer);

        // Close handler
        drawer.querySelector('#task-drawer-close')?.addEventListener('click', () => this.closeTaskDrawer());

        // Reposition on resize if open
        window.addEventListener('resize', () => {
            const d = document.getElementById('task-drawer');
            if (!d || !d.classList.contains('open')) return;
            this.positionTaskDrawer();
        });

        // Reposition when sidebar expands/collapses (hover triggers width transition)
        const sidebar = document.querySelector('.app-sidebar');
        if (sidebar) {
            const rePos = () => {
                const d = document.getElementById('task-drawer');
                if (!d || !d.classList.contains('open')) return;
                this.positionTaskDrawer();
            };
            sidebar.addEventListener('mouseenter', rePos);
            sidebar.addEventListener('mouseleave', rePos);
            sidebar.addEventListener('transitionend', (e) => {
                if (e.propertyName === 'width') rePos();
            });
        }
    },

    positionTaskDrawer() {
        // Align the drawer to the main content column so it doesn't overlap the widget panel
        const wrapper = document.getElementById('main-content-wrapper');
        const drawer = document.getElementById('task-drawer');
        if (!wrapper || !drawer) return;
        const rect = wrapper.getBoundingClientRect();
        drawer.style.left = rect.left + 'px';
        drawer.style.width = rect.width + 'px';
    },

    openTaskDrawer(taskId) {
        this.ensureTaskDrawer();
        const drawer = document.getElementById('task-drawer');
        const titleEl = document.getElementById('task-drawer-title');
        const typeEl = document.getElementById('task-drawer-type');
        const left = document.getElementById('task-left');
        const right = document.getElementById('task-right');
        if (!drawer || !left || !right) return;

        const task = (this.tasks || []).find(t => t.id === taskId);
        if (!task) return;

        // Resolve related entities
        const contact = (this.contacts || []).find(c => c.id === task.contactId);
        const account = (this.accounts || []).find(a => a.id === task.accountId);

        // Header
        titleEl.textContent = task.title || 'Task';
        typeEl.textContent = (task.type || 'task').toUpperCase();

        // Left: Task actions and logging
        const contactName = task.contactName || (contact ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() : '—');
        const accountName = task.accountName || (account?.name || '—');
        const phone = contact?.phone || account?.phone || '';
        const email = contact?.email || '';

        left.innerHTML = `
          <div class="card">
            <div class="section-title">Current Task</div>
            <div class="meta">
              <div><strong>Type:</strong> ${task.type}</div>
              <div><strong>Priority:</strong> ${task.priority}</div>
              <div><strong>Due:</strong> ${task.dueDate instanceof Date ? task.dueDate.toLocaleString() : task.dueDate}</div>
              <div><strong>Contact:</strong> ${contactName}</div>
              <div><strong>Account:</strong> ${accountName}</div>
            </div>
            <div class="actions-row">
              ${task.type === 'call' ? `<button class="btn btn-primary" id="task-start-call">Start Call</button>` : ''}
              ${task.type === 'email' ? `<button class="btn" id="task-start-email">Compose Email</button>` : ''}
              ${task.type === 'linkedin' ? `<button class="btn" id="task-start-linkedin">Open LinkedIn</button>` : ''}
            </div>
          </div>

          <div class="card">
            <div class="section-title">Notes & Disposition</div>
            <textarea id="task-notes" placeholder="Type your notes..." class="notes"></textarea>
            <div class="row">
              <label for="task-disposition">Disposition</label>
              <select id="task-disposition">
                <option value="completed">Completed</option>
                <option value="left-voicemail">Left Voicemail</option>
                <option value="no-answer">No Answer</option>
                <option value="schedule-follow-up">Schedule Follow-up</option>
              </select>
            </div>
            <div class="footer-actions">
              <button class="btn btn-primary" id="task-complete-log">Complete & Log</button>
              <button class="btn" id="task-cancel">Cancel</button>
            </div>
          </div>
        `;

        // Right: Company & Contact details (compact)
        right.innerHTML = `
          <div class="card">
            <div class="section-title">Company</div>
            <div class="kv"><span>Account</span><strong>${accountName}</strong></div>
            <div class="kv"><span>Phone</span><strong>${account?.phone || '—'}</strong></div>
            <div class="kv"><span>Industry</span><strong>${account?.industry || '—'}</strong></div>
            <div class="kv"><span>Location</span><strong>${this.formatLocation ? this.formatLocation(account || {}) : (account?.location || '—')}</strong></div>
            ${account ? `<div style="margin-top:10px;"><button class="btn" id="open-account-detail">Open Account Page</button></div>` : ''}
          </div>
          ${contact ? `
          <div class="card">
            <div class="section-title">Contact</div>
            <div class="kv"><span>Name</span><strong>${contact.firstName || ''} ${contact.lastName || ''}</strong></div>
            <div class="kv"><span>Email</span><strong>${contact.email || '—'}</strong></div>
            <div class="kv"><span>Phone</span><strong>${contact.phone || '—'}</strong></div>
            ${contact.linkedin ? `<div class="kv"><span>LinkedIn</span><a href="${contact.linkedin}" target="_blank">Profile</a></div>` : ''}
          </div>` : ''}
        `;

        // Wire up actions
        left.querySelector('#task-cancel')?.addEventListener('click', () => this.closeTaskDrawer());
        left.querySelector('#task-complete-log')?.addEventListener('click', async () => {
            const notes = /** @type {HTMLTextAreaElement|null} */(document.getElementById('task-notes'))?.value || '';
            const disposition = /** @type {HTMLSelectElement|null} */(document.getElementById('task-disposition'))?.value || 'completed';
            // Mark task completed in local state
            const t = (this.tasks || []).find(x => x.id === taskId);
            if (t) { t.completed = true; t.status = 'completed'; }
            this.updateTaskCounts();
            this.renderSimpleTasksTable();

            // Log activity to Firebase via saveActivity
            const activity = {
                type: 'task_completed',
                description: `${(task.type || 'task').toUpperCase()} - ${task.title || ''}`,
                noteContent: notes,
                contactName: contactName,
                accountName: accountName,
                taskId: taskId,
                disposition
            };
            try { await this.saveActivity(activity); } catch (e) { console.warn('saveActivity failed', e); }

            this.showNotification('Task completed and logged', 'success');
            this.closeTaskDrawer();
        });

        if (account) {
            right.querySelector('#open-account-detail')?.addEventListener('click', () => {
                this.closeTaskDrawer();
                this.showAccountDetails(account.id);
            });
        }

        if (task.type === 'call') {
            left.querySelector('#task-start-call')?.addEventListener('click', () => {
                // Open dialer widget and prefill number
                if (typeof this.openDialerWidget === 'function') this.openDialerWidget('crm');
                const input = document.getElementById('dialer-phone-input');
                if (input && phone) input.value = phone;
            });
        } else if (task.type === 'email') {
            left.querySelector('#task-start-email')?.addEventListener('click', () => {
                if (typeof this.openCompose === 'function') {
                    this.openCompose({ to: email || '', subject: `Re: ${task.title || ''}` });
                } else if (window.CRMApp?.openCompose) {
                    window.CRMApp.openCompose({ to: email || '', subject: `Re: ${task.title || ''}` });
                }
            });
        } else if (task.type === 'linkedin') {
            left.querySelector('#task-start-linkedin')?.addEventListener('click', () => {
                const url = contact?.linkedin || (account?.website ? `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(account.website)}` : 'https://www.linkedin.com');
                window.open(url, '_blank');
            });
        }

        // Position and open
        this.positionTaskDrawer();
        // Small async to allow styles to apply before adding class
        requestAnimationFrame(() => drawer.classList.add('open'));
    },

    closeTaskDrawer() {
        const drawer = document.getElementById('task-drawer');
        if (!drawer) return;
        drawer.classList.remove('open');
    }
});

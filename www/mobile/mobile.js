(function () {
	"use strict";

	const SCREEN_NAMES = ["workbench", "planner", "calendar"];
	const NAV_ITEMS = [
		{ name: "workbench", label: "Workbench", icon: "dashboard" },
		{ name: "planner", label: "Planner", icon: "view_week" },
		{ name: "calendar", label: "Calendar", icon: "calendar_month" },
	];
	const CALENDAR_TOKEN_KEY = "hm_google_access_token";
	const CALENDAR_EXPIRY_KEY = "hm_google_access_token_expires_at";
	const CALENDAR_SCOPES = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";
	const VEHICLE_CATEGORY_OPTIONS = ["Repair", "Maintenance", "Clean", "Install", "Organize", "Build"];
	const VEHICLE_STATE_OPTIONS = ["Recommended", "Not Started", "In Progress", "Completed", "Cancelled", "Deferred"];
	const VEHICLE_ASSET_OPTIONS = [
		"Ford Expedition",
		"Toyota Tundra",
		"Toyota Corolla",
		"Hyundai Elantra",
		"Canam Commander",
		"Westinghouse i2500 Generator",
		"Westinghouse 9500 Generator",
		"Westinghouse 12K Generator",
		"Proyama Gas-Powered Trimmer",
		"John Deere X350",
		"Power King Chipper",
	];

	const state = {
		screen: "",
		loadId: 0,
		modalTemplate: "",
		projects: [],
		tasks: [],
		parking: [],
		planner: { weekStartDate: "", tasks: [] },
		calendarEvents: [],
		calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
		selectedDate: toDateKey(new Date()),
		tokenClient: null,
	};

	const app = document.getElementById("app");
	const modalRoot = document.getElementById("modal-root");
	const navRoot = document.getElementById("bottom-nav");

	function escapeHtml(value) {
		return String(value == null ? "" : value)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}

	function cleanText(value, fallback) {
		const result = value == null ? "" : String(value).trim();
		return result || fallback || "";
	}

	function toDateKey(value) {
		const date = value instanceof Date ? value : new Date(value);
		if (Number.isNaN(date.getTime())) return "";
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	function parseDateKey(value) {
		const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleanText(value));
		return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
	}

	function addDays(value, amount) {
		const date = parseDateKey(value);
		date.setDate(date.getDate() + amount);
		return toDateKey(date);
	}

	function mondayOf(value) {
		const date = parseDateKey(value);
		const day = date.getDay();
		date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
		return toDateKey(date);
	}

	function makeId(prefix) {
		if (window.crypto && typeof window.crypto.randomUUID === "function") {
			return window.crypto.randomUUID();
		}
		return `${prefix || "mobile"}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	}

	async function fetchFragment(path) {
		const response = await fetch(new URL(path, document.baseURI).toString(), { cache: "no-store" });
		if (!response.ok) throw new Error(`Unable to load ${path} (${response.status}).`);
		return response.text();
	}

	function initNav() {
		navRoot.innerHTML = NAV_ITEMS.map((item) => `
			<button type="button" class="nav-item" data-screen-name="${item.name}" aria-label="${item.label}">
				<span class="material-symbols-rounded" aria-hidden="true">${item.icon}</span>
				<span>${item.label}</span>
			</button>
		`).join("");

		navRoot.addEventListener("click", (event) => {
			const button = event.target.closest("[data-screen-name]");
			if (button) loadScreen(button.dataset.screenName);
		});
	}

	function setActiveNav(name) {
		navRoot.querySelectorAll("[data-screen-name]").forEach((button) => {
			const active = button.dataset.screenName === name;
			button.classList.toggle("is-active", active);
			button.setAttribute("aria-current", active ? "page" : "false");
		});
	}

	async function loadScreen(name) {
		const screenName = SCREEN_NAMES.includes(name) ? name : "workbench";
		const loadId = ++state.loadId;
		app.innerHTML = '<div class="loading-card">Loading...</div>';
		setActiveNav(screenName);

		try {
			const html = await fetchFragment(`screens/${screenName}.html`);
			if (loadId !== state.loadId) return;
			state.screen = screenName;
			app.innerHTML = html;
			window.scrollTo({ top: 0, behavior: "instant" });
			history.replaceState(null, "", `#${screenName}`);

			if (screenName === "workbench") await initWorkbench(loadId);
			if (screenName === "planner") await initPlanner(loadId);
			if (screenName === "calendar") await initCalendar(loadId);
		} catch (error) {
			if (loadId !== state.loadId) return;
			app.innerHTML = '<div class="empty-state">Unable to load this screen.</div>';
			showError(error);
		}
	}

	function openModal(contentHTML) {
		const fallback = '<div class="modal-backdrop" data-modal-backdrop><section class="mobile-modal" role="dialog" aria-modal="true"><button class="modal-close icon-button" data-modal-close aria-label="Close dialog"><span class="material-symbols-rounded">close</span></button><div class="modal-content" data-modal-content></div></section></div>';
		modalRoot.innerHTML = state.modalTemplate || fallback;
		const content = modalRoot.querySelector("[data-modal-content]");
		if (content) content.innerHTML = contentHTML;
		modalRoot.querySelector("[data-modal-close]")?.addEventListener("click", closeModal);
		modalRoot.querySelector("[data-modal-backdrop]")?.addEventListener("click", (event) => {
			if (event.target === event.currentTarget) closeModal();
		});
		document.body.style.overflow = "hidden";
		modalRoot.querySelector("input, select, textarea, button:not([data-modal-close])")?.focus();
		return content;
	}

	function closeModal() {
		modalRoot.innerHTML = "";
		document.body.style.overflow = "";
	}

	function showError(error) {
		const message = cleanText(error && error.message, "Something went wrong.");
		const content = openModal(`
			<h2 id="mobile-modal-title">Unable to complete action</h2>
			<p>${escapeHtml(message)}</p>
			<div class="modal-actions"><button type="button" class="primary-action" data-error-close>OK</button></div>
		`);
		content?.querySelector("[data-error-close]")?.addEventListener("click", closeModal);
	}

	function optionMarkup(values, selected, allLabel) {
		const unique = [...new Set(values.map((value) => cleanText(value)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
		return `<option value="">${escapeHtml(allLabel)}</option>${unique.map((value) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`).join("")}`;
	}

	function sourceDisplayLabel(value) {
		const labels = {
			project_list_a: "Home",
			project_list_b: "Vehicle/Small Engine",
			project_list_c: "Repeatable",
			project_list_d: "Miscellaneous",
		};
		const source = cleanText(value);
		const key = source.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
		const labelKey = Object.keys(labels).find((candidate) => key.includes(candidate));
		return labelKey ? labels[labelKey] : source;
	}

	function sourceFilterMarkup(values, selected) {
		const unique = [...new Set(values.map((value) => cleanText(value)).filter(Boolean))];
		return `<option value="">All sources</option>${unique.map((value) => {
			return `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(sourceDisplayLabel(value))}</option>`;
		}).join("")}`;
	}

	function projectAccent(source) {
		const value = cleanText(source).toLowerCase();
		if (value.includes("vehicle") || value.includes("list_b")) return "#d97706";
		if (value.includes("repeat") || value.includes("list_c")) return "#7c3aed";
		if (value.includes("misc") || value.includes("list_d")) return "#2563eb";
		return "#087f73";
	}

	async function initWorkbench(loadId) {
		const search = document.getElementById("mobile-project-search");
		const source = document.getElementById("mobile-source-filter");
		const category = document.getElementById("mobile-category-filter");
		const projectState = document.getElementById("mobile-state-filter");
		[search, source, category, projectState].forEach((control) => control?.addEventListener("input", renderProjects));
		document.getElementById("mobile-show-projects")?.addEventListener("change", updateWorkbenchListVisibility);
		document.getElementById("mobile-show-tasks")?.addEventListener("change", updateWorkbenchListVisibility);
		document.getElementById("mobile-add-project")?.addEventListener("click", openAddProject);
		document.querySelector("[data-screen='workbench']")?.addEventListener("click", handleWorkbenchAction);
		updateWorkbenchListVisibility();

		try {
			const [projects, tasks] = await Promise.all([
				window.ProjectsService.loadAllProjects(),
				window.PlannerStorage.getTaskManager(),
			]);
			if (loadId !== state.loadId) return;
			state.projects = Array.isArray(projects) ? projects : [];
			state.tasks = Array.isArray(tasks) ? tasks : [];
			source.innerHTML = sourceFilterMarkup(state.projects.map((item) => item.source), "");
			category.innerHTML = optionMarkup(state.projects.map((item) => item.category), "", "All categories");
			projectState.innerHTML = optionMarkup(state.projects.map((item) => item.state), "", "All states");
			renderProjects();
			renderTaskManager();
		} catch (error) {
			showError(error);
		}
	}

	function updateWorkbenchListVisibility() {
		const projectSection = document.getElementById("mobile-project-section");
		const taskSection = document.getElementById("mobile-task-section");
		const showProjects = document.getElementById("mobile-show-projects")?.checked !== false;
		const showTasks = document.getElementById("mobile-show-tasks")?.checked !== false;
		if (projectSection) projectSection.hidden = !showProjects;
		if (taskSection) taskSection.hidden = !showTasks;
	}

	async function openAddProject() {
		const content = openModal(`
			<h2 id="mobile-modal-title">Add Project</h2>
			<p>Loading project fields from Google Sheets...</p>
			<div class="loading-card">Loading options...</div>
		`);

		try {
			const dropdowns = await window.SheetsService.fetchProjectDropdownOptions();
			if (!content || !content.isConnected) return;
			content.innerHTML = `
				<h2 id="mobile-modal-title">Add Project</h2>
				<p>Choose the destination list and project details.</p>
				<form class="modal-form" data-add-project-form>
					<label>Title<input name="title" type="text" required autocomplete="off"></label>
					<label>Source<select name="source" required><option value="home">Home</option><option value="vehicle">Vehicle / Small Engine</option><option value="repeating">Repeating Household</option><option value="misc">Miscellaneous</option></select></label>
					<label>Category<select name="category"></select></label>
					<label>State<select name="state"></select></label>
					<label data-area-field>Area<select name="area"></select></label>
					<div class="status-message" data-modal-status></div>
					<div class="modal-actions"><button type="button" class="secondary-action" data-modal-cancel>Cancel</button><button type="submit" class="primary-action">Submit</button></div>
				</form>
			`;

			const form = content.querySelector("[data-add-project-form]");
			const sourceSelect = form.querySelector("[name='source']");
			const updateDropdowns = async () => {
				const areaField = form.querySelector("[data-area-field]");
				if (areaField) areaField.hidden = sourceSelect.value === "misc";
				if (sourceSelect.value === "misc") {
					form.querySelector("[name='category']").innerHTML = '<option value="">Loading categories...</option>';
					form.querySelector("[name='state']").innerHTML = optionMarkup((dropdowns.misc || {}).state || [], "", "Select state");
					try {
						const categories = await window.SheetsService.fetchCategoriesForTab(window.SheetsService.TABS.misc);
						form.querySelector("[name='category']").innerHTML = optionMarkup(categories, "", "Select category");
					} catch (error) {
						form.querySelector("[name='category']").innerHTML = optionMarkup((dropdowns.misc || {}).category || [], "", "Select category");
					}
					return;
				}
				const sourceOptions = dropdowns[sourceSelect.value] || {};
				form.querySelector("[name='category']").innerHTML = optionMarkup(sourceOptions.category || [], "", "Select category");
				form.querySelector("[name='state']").innerHTML = optionMarkup(sourceOptions.state || [], "", "Select state");
				form.querySelector("[name='area']").innerHTML = optionMarkup(sourceOptions.area || [], "", "Select area");
			};

			sourceSelect.addEventListener("change", updateDropdowns);
			content.querySelector("[data-modal-cancel]").addEventListener("click", closeModal);
			form.addEventListener("submit", async (event) => {
				event.preventDefault();
				const submitButton = form.querySelector("[type='submit']");
				const status = form.querySelector("[data-modal-status]");
				const values = new FormData(form);
				submitButton.disabled = true;
				status.textContent = "Creating project...";

				try {
					await window.ProjectsService.createProject({
						title: cleanText(values.get("title")),
						source: cleanText(values.get("source")),
						category: cleanText(values.get("category")),
						state: cleanText(values.get("state")),
						area: cleanText(values.get("area")),
					});
					const projects = await window.ProjectsService.loadAllProjects();
					state.projects = Array.isArray(projects) ? projects : [];
					closeModal();
					refreshWorkbenchProjectControls();
					renderProjects();
				} catch (error) {
					status.textContent = cleanText(error && error.message, "Unable to create project.");
					submitButton.disabled = false;
				}
			});
			updateDropdowns();
			form.querySelector("[name='title']").focus();
		} catch (error) {
			closeModal();
			showError(error);
		}
	}

	function refreshWorkbenchProjectControls() {
		const source = document.getElementById("mobile-source-filter");
		const category = document.getElementById("mobile-category-filter");
		const projectState = document.getElementById("mobile-state-filter");
		if (!source || !category || !projectState) return;
		const selectedSource = source.value;
		const selectedCategory = category.value;
		const selectedState = projectState.value;
		source.innerHTML = sourceFilterMarkup(state.projects.map((item) => item.source), selectedSource);
		category.innerHTML = optionMarkup(state.projects.map((item) => item.category), selectedCategory, "All categories");
		projectState.innerHTML = optionMarkup(state.projects.map((item) => item.state), selectedState, "All states");
	}

	function renderProjects() {
		const list = document.getElementById("mobile-project-list");
		if (!list) return;
		const query = cleanText(document.getElementById("mobile-project-search")?.value).toLowerCase();
		const source = cleanText(document.getElementById("mobile-source-filter")?.value);
		const category = cleanText(document.getElementById("mobile-category-filter")?.value);
		const projectState = cleanText(document.getElementById("mobile-state-filter")?.value);
		const projects = state.projects.filter((project) => {
			const haystack = `${project.title} ${project.category} ${project.state} ${project.source}`.toLowerCase();
			return (!query || haystack.includes(query)) && (!source || project.source === source) && (!category || project.category === category) && (!projectState || project.state === projectState);
		});
		document.getElementById("mobile-project-count").textContent = String(projects.length);
		list.innerHTML = projects.length ? projects.map((project) => `
			<article class="mobile-card" style="--card-accent:${projectAccent(project.source)}">
				<h3>${escapeHtml(project.title || "Untitled project")}</h3>
				<div class="card-meta"><span>${escapeHtml(sourceDisplayLabel(project.source) || "Home")}</span><span>${escapeHtml(project.category || "Uncategorized")}</span><span>${escapeHtml(project.state || "Unknown")}</span></div>
				<div class="card-actions">
					<button type="button" data-project-action="edit" data-project-key="${escapeHtml(project.uiKey || `${project.source}:${project.id}`)}">Edit Details</button>
					<button type="button" class="danger-action" data-project-action="delete" data-project-key="${escapeHtml(project.uiKey || `${project.source}:${project.id}`)}">Delete</button>
					<button type="button" data-project-action="task" data-project-key="${escapeHtml(project.uiKey || `${project.source}:${project.id}`)}">Add to Task Manager</button>
				</div>
			</article>
		`).join("") : '<div class="empty-state">No projects match these filters.</div>';
	}

	function projectByKey(key) {
		return state.projects.find((project) => (project.uiKey || `${project.source}:${project.id}`) === key);
	}

	async function handleWorkbenchAction(event) {
		const projectButton = event.target.closest("[data-project-action]");
		if (projectButton) {
			const project = projectByKey(projectButton.dataset.projectKey);
			if (!project) return;
			if (projectButton.dataset.projectAction === "edit") openProjectEditor(project);
			if (projectButton.dataset.projectAction === "delete") confirmProjectDelete(project);
			if (projectButton.dataset.projectAction === "task") addProjectToTasks(project);
			return;
		}
		const taskButton = event.target.closest("[data-task-action]");
		if (!taskButton) return;
		const task = state.tasks.find((item) => cleanText(item.id) === taskButton.dataset.taskId);
		if (!task) return;
		if (taskButton.dataset.taskAction === "send") openSendTask(task);
		if (taskButton.dataset.taskAction === "remove") confirmTaskRemoval(task);
	}

	async function openProjectEditor(project) {
		const metadata = project.metadata || {};
		const content = openModal(`
			<h2 id="mobile-modal-title">Edit Project Details</h2>
			<p>Loading project fields from Google Sheets...</p>
			<div class="loading-card">Loading options...</div>
		`);

		try {
			const dropdowns = await window.SheetsService.fetchProjectDropdownOptions();
			if (!content || !content.isConnected) return;
			const source = cleanText(project.source).toLowerCase();
			const sourceKey = source.includes("list_b") || source.includes("vehicle")
				? "vehicle"
				: source.includes("list_c") || source.includes("repeat") ? "repeating" : "home";
			const options = dropdowns[sourceKey] || {};
			const currentCategory = cleanText(project.category);
			const currentState = cleanText(project.state);
			const currentArea = cleanText(metadata.area);
			const currentVehicle = cleanText(metadata.vehicle || metadata.asset);
			const categoryOptions = sourceKey === "vehicle"
				? [...VEHICLE_CATEGORY_OPTIONS, ...(options.category || [])]
				: options.category || [];
			const stateOptions = sourceKey === "vehicle"
				? [...VEHICLE_STATE_OPTIONS, ...(options.state || [])]
				: options.state || [];
			const vehicleOptions = sourceKey === "vehicle"
				? [
					currentVehicle,
					...VEHICLE_ASSET_OPTIONS,
					...(options.vehicle || []),
					...state.projects
						.filter((item) => cleanText(item.source).toLowerCase().includes("list_b"))
						.map((item) => cleanText(item.metadata && (item.metadata.vehicle || item.metadata.asset))),
				]
				: [];
			const locationField = sourceKey === "vehicle"
				? `<label>Vehicle/Small Engine<select name="vehicle">${optionMarkup(vehicleOptions, currentVehicle, "Select vehicle or small engine")}</select></label>`
				: `<label>Area<select name="area">${optionMarkup([currentArea, ...(options.area || [])], currentArea, "Select area")}</select></label>`;

			content.innerHTML = `
				<h2 id="mobile-modal-title">Edit Project Details</h2><p>Changes save to the project sheet.</p>
				<form class="modal-form" data-project-form>
					<label>Title<input name="title" value="${escapeHtml(project.title)}" required></label>
					<label>Category<select name="category">${optionMarkup([currentCategory, ...categoryOptions], currentCategory, "Select category")}</select></label>
					<label>State<select name="state">${optionMarkup([currentState, ...stateOptions], currentState, "Select state")}</select></label>
					${locationField}
					<div class="status-message" data-modal-status></div>
					<div class="modal-actions"><button type="button" class="secondary-action" data-modal-cancel>Cancel</button><button type="submit" class="primary-action">Save</button></div>
				</form>
			`;
			content.querySelector("[data-modal-cancel]").addEventListener("click", closeModal);
			content.querySelector("[data-project-form]").addEventListener("submit", async (event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				const updated = {
					...project,
					title: cleanText(form.get("title"), project.title),
					category: cleanText(form.get("category"), project.category),
					state: cleanText(form.get("state"), project.state),
					metadata: {
						...metadata,
						...(sourceKey === "vehicle"
							? { vehicle: cleanText(form.get("vehicle")) }
							: { area: cleanText(form.get("area")) }),
						_originalTitle: project.title,
						_originalId: project.id,
					},
				};
				try {
					await window.SheetsService.updateProjectInSheet(updated);
					Object.assign(project, updated);
					closeModal();
					renderProjects();
				} catch (error) {
					content.querySelector("[data-modal-status]").textContent = cleanText(error.message, "Unable to save project.");
				}
			});
			content.querySelector("[name='title']").focus();
		} catch (error) {
			closeModal();
			showError(error);
		}
	}

	function confirmProjectDelete(project) {
		const content = openModal(`
			<h2 id="mobile-modal-title">Delete project?</h2><p>“${escapeHtml(project.title)}” will be permanently removed from its project sheet.</p>
			<div class="status-message" data-modal-status></div>
			<div class="modal-actions"><button type="button" class="secondary-action" data-modal-cancel>Cancel</button><button type="button" class="danger-action" data-confirm-delete>Delete</button></div>
		`);
		content.querySelector("[data-modal-cancel]").addEventListener("click", closeModal);
		content.querySelector("[data-confirm-delete]").addEventListener("click", async () => {
			try {
				await window.SheetsService.deleteProject(project);
				window.ProjectsService.deleteProject(project);
				state.projects = state.projects.filter((item) => item !== project);
				closeModal();
				renderProjects();
			} catch (error) {
				content.querySelector("[data-modal-status]").textContent = cleanText(error.message, "Unable to delete project.");
			}
		});
	}

	async function addProjectToTasks(project) {
		try {
			const task = await window.PlannerStorage.upsertTaskManagerTask({
				id: makeId("task"), projectId: project.id, title: project.title, source: project.source,
				category: project.category, state: project.state, priority: project.metadata?.priority || "",
			});
			state.tasks.push(task);
			renderTaskManager();
		} catch (error) {
			showError(error);
		}
	}

	function renderTaskManager() {
		const list = document.getElementById("mobile-task-list");
		if (!list) return;
		document.getElementById("mobile-task-count").textContent = String(state.tasks.length);
		list.innerHTML = state.tasks.length ? state.tasks.map((task) => `
			<article class="mobile-card" style="--card-accent:${projectAccent(task.source)}">
				<h3>${escapeHtml(task.title || "Untitled task")}</h3>
				<div class="card-meta"><span>${escapeHtml(task.source || "Ad-Hoc")}</span><span>${escapeHtml(task.category || "Uncategorized")}</span></div>
				<div class="card-actions">
					<button type="button" data-task-action="send" data-task-id="${escapeHtml(task.id)}">Send to Weekly Planner</button>
					<button type="button" class="danger-action" data-task-action="remove" data-task-id="${escapeHtml(task.id)}">Remove from Task Manager</button>
				</div>
			</article>
		`).join("") : '<div class="empty-state">No tasks are waiting.</div>';
	}

	function openSendTask(task) {
		const content = openModal(`
			<h2 id="mobile-modal-title">Send to Weekly Planner</h2><p>${escapeHtml(task.title)}</p>
			<form class="modal-form" data-send-form>
				<label>Date<input type="date" name="date" value="${toDateKey(new Date())}" required></label>
				<label>Time of day<select name="timeSlot"><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select></label>
				<div class="status-message" data-modal-status></div>
				<div class="modal-actions"><button type="button" class="secondary-action" data-modal-cancel>Cancel</button><button type="submit" class="primary-action">Send</button></div>
			</form>
		`);
		content.querySelector("[data-modal-cancel]").addEventListener("click", closeModal);
		content.querySelector("[data-send-form]").addEventListener("submit", async (event) => {
			event.preventDefault();
			const form = new FormData(event.currentTarget);
			try {
				await window.PlannerStorage.upsertWeeklyTask({
					id: makeId("weekly"), taskId: task.id, projectId: task.projectId, title: task.title,
					source: task.source, category: task.category, priority: task.priority,
					date: form.get("date"), timeSlot: form.get("timeSlot"), bucket: form.get("timeSlot"), completed: false,
				});
				await window.PlannerStorage.deleteTaskManagerTask(task.id);
				state.tasks = state.tasks.filter((item) => item !== task);
				closeModal();
				renderTaskManager();
			} catch (error) {
				content.querySelector("[data-modal-status]").textContent = cleanText(error.message, "Unable to schedule task.");
			}
		});
	}

	function confirmTaskRemoval(task) {
		const content = openModal(`<h2 id="mobile-modal-title">Remove task?</h2><p>${escapeHtml(task.title)}</p><div class="status-message" data-modal-status></div><div class="modal-actions"><button type="button" class="secondary-action" data-modal-cancel>Cancel</button><button type="button" class="danger-action" data-confirm-remove>Remove</button></div>`);
		content.querySelector("[data-modal-cancel]").addEventListener("click", closeModal);
		content.querySelector("[data-confirm-remove]").addEventListener("click", async () => {
			try {
				await window.PlannerStorage.deleteTaskManagerTask(task.id);
				state.tasks = state.tasks.filter((item) => item !== task);
				closeModal();
				renderTaskManager();
			} catch (error) {
				content.querySelector("[data-modal-status]").textContent = cleanText(error.message, "Unable to remove task.");
			}
		});
	}

	async function initPlanner(loadId) {
		document.getElementById("mobile-add-adhoc")?.addEventListener("click", openAdHocTask);
		document.getElementById("mobile-add-parking")?.addEventListener("click", openAddParkingItem);
		document.getElementById("mobile-week-prev")?.addEventListener("click", () => shiftVisibleWeek(-1));
		document.getElementById("mobile-week-today")?.addEventListener("click", () => {
			state.planner.weekStartDate = mondayOf(new Date());
			renderWeeklyPlanner();
		});
		document.getElementById("mobile-week-next")?.addEventListener("click", () => shiftVisibleWeek(1));
		document.querySelector("[data-screen='planner']")?.addEventListener("click", handlePlannerAction);
		try {
			const [parking, planner] = await Promise.all([
				window.PlannerStorage.getParkingLot(),
				window.PlannerStorage.getWeeklyPlanner(),
			]);
			if (loadId !== state.loadId) return;
			state.parking = Array.isArray(parking) ? parking.filter((item) => !item.deleted && !item.archived).map(hydrateParkingConversion) : [];
			state.planner = planner && typeof planner === "object" ? planner : { weekStartDate: mondayOf(new Date()), tasks: [] };
			state.planner.weekStartDate = cleanText(state.planner.weekStartDate, mondayOf(new Date()));
			state.planner.tasks = Array.isArray(state.planner.tasks) ? state.planner.tasks : [];
			renderParkingLot();
			renderWeeklyPlanner();
		} catch (error) {
			showError(error);
		}
	}

	function shiftVisibleWeek(offset) {
		const current = cleanText(state.planner.weekStartDate, mondayOf(new Date()));
		state.planner.weekStartDate = addDays(current, Number(offset) * 7);
		renderWeeklyPlanner();
	}

	function hydrateParkingConversion(item) {
		if (!item || typeof item !== "object") return item;
		try {
			const metadata = JSON.parse(cleanText(item.metadataJson, "{}"));
			const stored = metadata && metadata.mobileConversion;
			if (stored && typeof stored === "object") {
				return { ...item, convertedTo: { ...(item.convertedTo || {}), ...stored } };
			}
		} catch (error) {
			// Keep the dedicated conversion columns when metadata is malformed.
		}
		return item;
	}

	function parkingMetadataWithConversion(item, conversion) {
		let metadata = {};
		try {
			metadata = JSON.parse(cleanText(item && item.metadataJson, "{}"));
		} catch (error) {
			metadata = {};
		}
		return JSON.stringify({ ...metadata, mobileConversion: conversion || null });
	}

	async function ensureLinkedParkingProject(title, source, conversion) {
		const project = {
			id: cleanText(conversion && conversion.id),
			source,
			title,
			category: "uncategorized",
			state: "unknown",
			metadata: {
				sheetRowNumber: Number(conversion && conversion.rowNumber || 0),
				_originalId: cleanText(conversion && conversion.id),
				_originalTitle: "",
			},
		};
		if (source === "vehicle") {
			return window.SheetsService.updateProjectInSheet(project);
		}
		return window.SheetsService.repairProjectTitle(project, {
			id: project.id,
			title,
			sheetRowNumber: project.metadata.sheetRowNumber,
		});
	}

	function openAddParkingItem() {
		const content = openModal(`
			<h2 id="mobile-modal-title">Add Parking Lot Item</h2>
			<p>Store ideas before they become work.</p>
			<form class="modal-form" data-add-parking-form>
				<label>Title<input name="title" type="text" required autocomplete="off"></label>
				<label>Notes<textarea name="notes"></textarea></label>
				<label>Convert To<select name="convertTo"><option value="none">None</option><option value="task-manager">Ad-Hoc Task</option><option value="project">Project</option><option value="repeatable">Repeatable Project</option></select></label>
				<div class="status-message" data-modal-status></div>
				<div class="modal-actions"><button type="button" class="secondary-action" data-modal-cancel>Cancel</button><button type="submit" class="primary-action">Save</button></div>
			</form>
		`);
		content.querySelector("[data-modal-cancel]").addEventListener("click", closeModal);
		content.querySelector("[data-add-parking-form]").addEventListener("submit", async (event) => {
			event.preventDefault();
			const form = event.currentTarget;
			const values = new FormData(form);
			const title = cleanText(values.get("title"));
			const convertTo = cleanText(values.get("convertTo"), "none");
			const submitButton = form.querySelector("[type='submit']");
			const status = form.querySelector("[data-modal-status]");
			submitButton.disabled = true;
			status.textContent = "Saving item...";

			try {
				const item = {
					id: makeId("parking"),
					title,
					notes: cleanText(values.get("notes")),
					tags: "",
					priority: "low",
					color: "#d1d5db",
					checklistJson: "[]",
					reminderJson: "{}",
					metadataJson: "{}",
					convertedTo: null,
				};

				if (convertTo === "task-manager") {
					const task = await window.PlannerStorage.upsertTaskManagerTask({
						id: item.id,
						taskId: item.id,
						projectId: item.id,
						title: item.title,
						source: "parking-lot",
						category: "uncategorized",
						state: "unknown",
						priority: 3,
					});
					item.convertedTo = { type: "task-manager", id: cleanText(task.id || task.taskId, item.id) };
					item.color = "#0f766e";
				} else if (convertTo === "project" || convertTo === "repeatable") {
					const result = await window.ProjectsService.createProject({
						source: convertTo === "repeatable" ? "repeating" : "home",
						title: item.title,
						category: "uncategorized",
						state: "unknown",
						priority: "3",
						addToRepeating: convertTo === "repeatable",
					});
					item.convertedTo = {
						type: convertTo,
						id: cleanText(result.id, item.id),
						tabName: cleanText(result.tabName),
						rowNumber: result.rowNumber,
						sheetSource: convertTo === "repeatable" ? "repeating" : "home",
					};
					const verified = await ensureLinkedParkingProject(item.title, item.convertedTo.sheetSource, item.convertedTo);
					item.convertedTo.rowNumber = verified.rowNumber || item.convertedTo.rowNumber;
					item.color = "#7c3aed";
				}
				item.metadataJson = parkingMetadataWithConversion(item, item.convertedTo);

				const saved = await window.PlannerStorage.upsertParkingItem(item);
				state.parking.push(saved);
				closeModal();
				renderParkingLot();
			} catch (error) {
				status.textContent = cleanText(error && error.message, "Unable to save parking lot item.");
				submitButton.disabled = false;
			}
		});
	}

	function renderParkingLot() {
		const list = document.getElementById("mobile-parking-list");
		if (!list) return;
		document.getElementById("mobile-parking-count").textContent = String(state.parking.length);
		list.innerHTML = state.parking.length ? state.parking.map((item) => `
			<article class="mobile-card" style="--card-accent:${escapeHtml(item.color || "#7c3aed")}">
				<h3>${escapeHtml(item.title || "Untitled item")}</h3>
				<div class="card-meta"><span>${escapeHtml(item.priority || "No priority")}</span>${item.convertedTo ? `<span>Converted to ${escapeHtml(item.convertedTo.type || "project")}</span>` : ""}</div>
				<div class="card-actions"><button type="button" data-parking-action="convert" data-parking-id="${escapeHtml(item.id)}">Convert</button><button type="button" data-parking-action="edit" data-parking-id="${escapeHtml(item.id)}">Edit</button><button type="button" class="danger-action" data-parking-action="delete" data-parking-id="${escapeHtml(item.id)}">Remove</button></div>
			</article>
		`).join("") : '<div class="empty-state">The parking lot is empty.</div>';
		window.requestAnimationFrame(() => updateParkingListViewport(list));
	}

	function updateParkingListViewport(list) {
		if (!list || !list.isConnected) return;
		const cards = Array.from(list.querySelectorAll(":scope > .mobile-card"));
		list.classList.toggle("is-scrollable", cards.length > 3);
		if (cards.length <= 3) {
			list.style.maxHeight = "";
			return;
		}
		const gap = Number.parseFloat(getComputedStyle(list).rowGap) || 0;
		const visibleHeight = cards.slice(0, 3).reduce((height, card) => height + card.getBoundingClientRect().height, gap * 2);
		list.style.maxHeight = `${Math.ceil(visibleHeight)}px`;
	}

	function visibleWeeklyTasks() {
		return state.planner.tasks.filter((task) => !task.deleted && !task.deletedInstance);
	}

	function isWeeklyProjectTask(task) {
		const type = cleanText(task && (task.taskType || task.type), "curated").toLowerCase();
		return type === "curated" || type === "project";
	}

	function weeklyTaskTone(task) {
		const type = cleanText(task && (task.taskType || task.type), "curated").toLowerCase();
		if (type === "repeatable") return "repeatable";
		if (type === "adhoc") return "adhoc";
		if (type === "curated" || type === "project") return "project";
		return "default";
	}

	function weeklyTimeSlot(task) {
		const slot = cleanText(task && (task.timeSlot || task.bucket), "morning").toLowerCase();
		return ["morning", "afternoon", "evening"].includes(slot) ? slot : "morning";
	}

	function normalizedChecklist(task) {
		return Array.isArray(task && task.checklist)
			? task.checklist.map((entry) => ({
				id: cleanText(entry && entry.id, makeId("check")),
				text: cleanText(entry && entry.text),
				completed: Boolean(entry && (entry.completed || entry.done)),
			})).filter((entry) => entry.text)
			: [];
	}

	function renderMobileWeeklyTask(task) {
		const taskId = escapeHtml(task.id || task.taskId);
		const tone = weeklyTaskTone(task);
		const timeSlot = weeklyTimeSlot(task);
		const timeBadge = `<span class="time-badge time-badge-${timeSlot}">${timeSlot[0].toUpperCase() + timeSlot.slice(1)}</span>`;
		if (tone === "adhoc") {
			return renderMobileAdhocTask(task, taskId, timeBadge);
		}
		if (!isWeeklyProjectTask(task)) {
			return `<article class="week-task week-task-${tone}${task.completed ? " is-complete" : ""}">
				<div class="task-title-row"><h3>${escapeHtml(task.title || "Untitled task")}</h3>${timeBadge}</div>${task.category ? `<div class="card-meta"><span>${escapeHtml(task.category)}</span></div>` : ""}
				<div class="card-actions"><button type="button" data-week-action="complete" data-week-id="${taskId}">${task.completed ? "Reopen" : "Complete"}</button><button type="button" data-week-action="edit" data-week-id="${taskId}">Edit</button><button type="button" class="danger-action" data-week-action="delete" data-week-id="${taskId}">Remove</button></div>
			</article>`;
		}

		const checklist = normalizedChecklist(task);
		const checklistOpen = Boolean(task.checklistOpen);
		const reminderActive = Boolean(task.reminder && task.reminder.active && task.reminder.sendAt);
		return `<article class="week-task week-task-${tone} weekly-project-task${task.completed ? " is-complete" : ""}" data-week-card="${taskId}">
			<div class="project-task-header">
				<button type="button" class="project-drag-button" data-week-action="edit" data-week-id="${taskId}" title="Move task" aria-label="Move task"><span aria-hidden="true">⋮⋮</span></button>
				<h3>${escapeHtml(task.title || "Untitled task")}</h3>
				${timeBadge}
				<div class="project-icon-actions">
					<button type="button" data-week-action="links" data-week-id="${taskId}" title="Resource Links" aria-label="Open resource links"><span class="material-symbols-rounded">link</span></button>
					<button type="button" class="${reminderActive ? "is-active" : ""}" data-week-action="reminder" data-week-id="${taskId}" title="${reminderActive ? "Reminder active" : "Send Reminder"}" aria-label="${reminderActive ? "Edit active reminder" : "Set reminder"}"><span class="material-symbols-rounded">${reminderActive ? "notifications_active" : "notifications_off"}</span></button>
					<button type="button" data-week-action="week" data-week-id="${taskId}" title="Move task to week" aria-label="Move task to week"><span class="material-symbols-rounded">calendar_month</span></button>
					<label class="project-complete-control" title="Mark task complete"><input type="checkbox" data-week-action="complete" data-week-id="${taskId}" ${task.completed ? "checked" : ""}><span class="material-symbols-rounded">check_box_outline_blank</span></label>
					<button type="button" class="danger-icon" data-week-action="delete" data-week-id="${taskId}" title="Remove task" aria-label="Remove task"><span class="material-symbols-rounded">close</span></button>
				</div>
			</div>
			<div class="mobile-checklist">
				<button type="button" class="checklist-toggle" data-week-action="checklist-toggle" data-week-id="${taskId}">Checklist ${checklistOpen ? "▲" : "▼"}</button>
				${checklistOpen ? `<div class="checklist-body">${checklist.length ? checklist.map((entry) => `<div class="checklist-item${entry.completed ? " is-complete" : ""}"><input type="checkbox" data-week-action="checklist-check" data-week-id="${taskId}" data-check-id="${escapeHtml(entry.id)}" ${entry.completed ? "checked" : ""}><span>${escapeHtml(entry.text)}</span><button type="button" data-week-action="checklist-remove" data-week-id="${taskId}" data-check-id="${escapeHtml(entry.id)}" aria-label="Remove ${escapeHtml(entry.text)}"><span class="material-symbols-rounded">close</span></button></div>`).join("") : '<div class="empty-state">No sub-tasks yet.</div>'}<div class="checklist-add"><input type="text" data-checklist-input placeholder="Add sub-task" aria-label="Add sub-task"><button type="button" data-week-action="checklist-add" data-week-id="${taskId}">Add</button></div></div>` : ""}
			</div>
		</article>`;
	}

	// Ad-hoc tasks get their own icon row (mirroring curated/project cards, minus the resource-links
	// button since ad-hoc has no linked project) plus a checklist icon that opens a modal instead of
	// the inline expand section, and a calendar icon (reused from curated/project) for rescheduling.
	function renderMobileAdhocTask(task, taskId, timeBadge) {
		const reminderActive = Boolean(task.reminder && task.reminder.active && task.reminder.sendAt);
		const checklistCount = normalizedChecklist(task).length;
		return `<article class="week-task week-task-adhoc weekly-project-task${task.completed ? " is-complete" : ""}" data-week-card="${taskId}">
			<div class="project-task-header">
				<button type="button" class="project-drag-button" data-week-action="edit" data-week-id="${taskId}" title="Edit task" aria-label="Edit task"><span aria-hidden="true">⋮⋮</span></button>
				<h3>${escapeHtml(task.title || "Untitled task")}</h3>
				${timeBadge}
				<div class="project-icon-actions">
					<button type="button" class="${reminderActive ? "is-active" : ""}" data-week-action="reminder" data-week-id="${taskId}" title="${reminderActive ? "Reminder active" : "Send Reminder"}" aria-label="${reminderActive ? "Edit active reminder" : "Set reminder"}"><span class="material-symbols-rounded">${reminderActive ? "notifications_active" : "notifications_off"}</span></button>
					<button type="button" data-week-action="adhoc-checklist" data-week-id="${taskId}" title="Checklist${checklistCount ? ` (${checklistCount})` : ""}" aria-label="Open checklist"><span class="material-symbols-rounded">checklist</span></button>
					<button type="button" data-week-action="week" data-week-id="${taskId}" title="Move task to week" aria-label="Move task to week"><span class="material-symbols-rounded">calendar_month</span></button>
					<label class="project-complete-control" title="Mark task complete"><input type="checkbox" data-week-action="complete" data-week-id="${taskId}" ${task.completed ? "checked" : ""}><span class="material-symbols-rounded">check_box_outline_blank</span></label>
					<button type="button" class="danger-icon" data-week-action="delete" data-week-id="${taskId}" title="Remove task" aria-label="Remove task"><span class="material-symbols-rounded">close</span></button>
				</div>
			</div>
		</article>`;
	}

	function renderWeeklyPlanner() {
		const list = document.getElementById("mobile-week-list");
		if (!list) return;
		const start = cleanText(state.planner.weekStartDate, mondayOf(new Date()));
		const end = addDays(start, 6);
		document.getElementById("mobile-week-label").textContent = `${parseDateKey(start).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${parseDateKey(end).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
		const tasks = visibleWeeklyTasks();
		list.innerHTML = Array.from({ length: 7 }, (_, index) => {
			const dateKey = addDays(start, index);
			const slotOrder = { morning: 0, afternoon: 1, evening: 2 };
			const dayTasks = tasks
				.filter((task) => cleanText(task.date || task.occurenceDate) === dateKey)
				.sort((left, right) => slotOrder[weeklyTimeSlot(left)] - slotOrder[weeklyTimeSlot(right)]);
			return `<section class="day-card"><header class="day-header"><strong>${parseDateKey(dateKey).toLocaleDateString(undefined, { weekday: "long" })}</strong><span>${parseDateKey(dateKey).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></header><div class="day-tasks">${dayTasks.length ? dayTasks.map(renderMobileWeeklyTask).join("") : '<div class="empty-state">No tasks</div>'}</div></section>`;
		}).join("");
	}

	function handlePlannerAction(event) {
		const parkingButton = event.target.closest("[data-parking-action]");
		if (parkingButton) {
			const item = state.parking.find((entry) => cleanText(entry.id) === parkingButton.dataset.parkingId);
			if (!item) return;
			if (parkingButton.dataset.parkingAction === "convert") openParkingConversion(item);
			if (parkingButton.dataset.parkingAction === "edit") openParkingEditor(item);
			if (parkingButton.dataset.parkingAction === "delete") confirmParkingRemoval(item);
			return;
		}
		const weekButton = event.target.closest("[data-week-action]");
		if (!weekButton) return;
		const task = state.planner.tasks.find((entry) => cleanText(entry.id || entry.taskId) === weekButton.dataset.weekId);
		if (!task) return;
		if (weekButton.dataset.weekAction === "complete") toggleWeeklyTask(task);
		if (weekButton.dataset.weekAction === "edit") openWeeklyEditor(task);
		if (weekButton.dataset.weekAction === "delete") confirmWeeklyRemoval(task);
		if (weekButton.dataset.weekAction === "links") openWeeklyResourceLinks(task);
		if (weekButton.dataset.weekAction === "reminder") openWeeklyReminder(task);
		if (weekButton.dataset.weekAction === "week") openWeekMove(task);
		if (weekButton.dataset.weekAction === "adhoc-checklist") openAdhocChecklistModal(task);
		if (weekButton.dataset.weekAction === "checklist-toggle") updateWeeklyChecklist(task, (checklist) => ({ checklist, checklistOpen: !task.checklistOpen }));
		if (weekButton.dataset.weekAction === "checklist-check") updateWeeklyChecklist(task, (checklist) => ({ checklist: checklist.map((entry) => entry.id === weekButton.dataset.checkId ? { ...entry, completed: weekButton.checked } : entry), checklistOpen: true }));
		if (weekButton.dataset.weekAction === "checklist-remove") updateWeeklyChecklist(task, (checklist) => ({ checklist: checklist.filter((entry) => entry.id !== weekButton.dataset.checkId), checklistOpen: true }));
		if (weekButton.dataset.weekAction === "checklist-add") {
			const input = weekButton.closest("[data-week-card]")?.querySelector("[data-checklist-input]");
			const text = cleanText(input && input.value);
			if (text) updateWeeklyChecklist(task, (checklist) => ({ checklist: [...checklist, { id: makeId("check"), text, completed: false }], checklistOpen: true }));
		}
	}

	async function updateWeeklyChecklist(task, updater) {
		try {
			const changes = updater(normalizedChecklist(task));
			const saved = await window.PlannerStorage.upsertWeeklyTask({ ...task, ...changes });
			Object.assign(task, saved);
			renderWeeklyPlanner();
		} catch (error) {
			showError(error);
		}
	}

	function parseResourceLinkEntries(value) {
		const toEntry = (entry) => {
			if (entry && typeof entry === "object") {
				const url = cleanText(entry.url || entry.href || entry.link);
				return url ? { url, title: cleanText(entry.title || entry.name || entry.label) } : null;
			}
			const url = cleanText(entry);
			return url ? { url, title: "" } : null;
		};

		if (Array.isArray(value)) return value.map(toEntry).filter(Boolean);

		const text = cleanText(value);
		if (!text) return [];

		if (text.startsWith("[") || text.startsWith("{")) {
			try {
				const parsed = JSON.parse(text);
				const entries = (Array.isArray(parsed) ? parsed : [parsed]).map(toEntry).filter(Boolean);
				if (entries.length) return entries;
			} catch (error) {
				// Fall through to delimiter parsing.
			}
		}

		return text.split(/[\n,]+/g).map((entry) => toEntry(entry.trim())).filter(Boolean);
	}

	function getYouTubeVideoId(url) {
		try {
			const parsed = new URL(cleanText(url));
			const host = parsed.hostname.toLowerCase();
			if (host.includes("youtu.be")) return cleanText(parsed.pathname.split("/").filter(Boolean)[0]);
			if (!host.includes("youtube.com")) return "";
			const fromQuery = cleanText(parsed.searchParams.get("v"));
			if (fromQuery) return fromQuery;
			const segments = parsed.pathname.split("/").filter(Boolean);
			const index = segments.findIndex((segment) => segment === "shorts" || segment === "embed");
			return index >= 0 ? cleanText(segments[index + 1]) : "";
		} catch (error) {
			return "";
		}
	}

	function getYouTubeCanonicalUrl(url) {
		const safeUrl = cleanText(url);
		const videoId = getYouTubeVideoId(safeUrl);
		return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : safeUrl;
	}

	async function fetchTitleFromOembed(endpoint, targetUrl) {
		const response = await fetch(`${endpoint}?url=${encodeURIComponent(targetUrl)}&format=json`, { method: "GET" });
		if (!response.ok) return "";
		const payload = await response.json();
		return cleanText(payload && payload.title);
	}

	async function resolveLinkTitle(url) {
		const safeUrl = cleanText(url);
		if (!safeUrl) return "";
		const canonicalUrl = getYouTubeCanonicalUrl(safeUrl);
		const endpoints = ["https://noembed.com/embed", "https://www.youtube.com/oembed", "https://www.youtube-nocookie.com/oembed"];

		for (let i = 0; i < endpoints.length; i += 1) {
			try {
				const title = await fetchTitleFromOembed(endpoints[i], canonicalUrl);
				if (title) return title;
			} catch (error) {
				// Try next endpoint.
			}
		}

		try {
			const response = await fetch(canonicalUrl, { method: "GET" });
			if (!response.ok) return safeUrl;
			const html = await response.text();
			const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
			return cleanText(match && match[1]).replace(/\s*-\s*YouTube\s*$/i, "") || safeUrl;
		} catch (error) {
			const videoId = getYouTubeVideoId(canonicalUrl);
			return videoId ? `YouTube Video ${videoId}` : safeUrl;
		}
	}

	function weeklyProjectIdentity(task) {
		const taskId = cleanText(task && (task.id || task.taskId));
		const type = cleanText(task && (task.taskType || task.type), "curated");
		const match = taskId.match(new RegExp(`^${type}-(.+)-(\\d{4}-\\d{2}-\\d{2})-\\d+(?:-\\d+)?$`));
		const composite = match ? match[1] : "";
		const sourceKey = cleanText(task && task.source).toLowerCase();
		const compositeId = composite.replace(/^(home|vehicle|repeating)-/, "");
		return { sourceKey, id: cleanText(task && task.projectId, compositeId) };
	}

	async function openWeeklyResourceLinks(task) {
		const content = openModal(`<h2 id="mobile-modal-title">Resource Links</h2><p>Loading project details...</p><div class="loading-card">Loading links...</div>`);
		try {
			if (!state.projects.length) {
				const projects = await window.ProjectsService.loadAllProjects();
				state.projects = Array.isArray(projects) ? projects : [];
			}
			if (!content || !content.isConnected) return;
			const identity = weeklyProjectIdentity(task);
			const project = state.projects.find((item) => {
				const sameId = cleanText(item.id) === identity.id;
				const source = cleanText(item.source).toLowerCase();
				return sameId && (!identity.sourceKey || source.includes(identity.sourceKey) || source.includes(`list_${identity.sourceKey === "home" ? "a" : identity.sourceKey === "vehicle" ? "b" : "c"}`));
			}) || state.projects.find((item) => cleanText(item.title) === cleanText(task.title));
			const rawLinks = project && (project.resourceLinkEntries || project.resourceLinks || project.metadata?.resourceLinks);
			const links = parseResourceLinkEntries(rawLinks);
			const renderLinks = (labels) => {
				content.innerHTML = `<h2 id="mobile-modal-title">Resource Links</h2><p>${escapeHtml(task.title)}</p>${links.length ? `<div class="resource-link-list">${links.map((link, index) => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer"><span class="material-symbols-rounded">open_in_new</span>${escapeHtml(cleanText(labels[index], link.url))}</a>`).join("")}</div>` : '<div class="empty-state">No resource links are attached to this project.</div>'}<div class="modal-actions"><button type="button" class="primary-action" data-modal-cancel>Close</button></div>`;
				content.querySelector("[data-modal-cancel]").addEventListener("click", closeModal);
			};

			renderLinks(links.map((link) => cleanText(link.title, link.url)));

			const resolved = await Promise.all(links.map((link) => (link.title ? Promise.resolve(link.title) : resolveLinkTitle(link.url))));
			if (!content.isConnected) return;
			renderLinks(resolved);
		} catch (error) {
			closeModal();
			showError(error);
		}
	}

	function reminderSendAt(task, form) {
		const selected = form.querySelector("[name='reminderOffset']:checked")?.value || "10";
		if (selected === "custom") {
			const custom = cleanText(form.elements.customTime.value);
			if (!custom) throw new Error("Choose a custom reminder time.");
			return new Date(`${task.date}T${custom}:00`);
		}
		const bucketTimes = { morning: "08:00", afternoon: "13:00", evening: "18:00" };
		const bucket = cleanText(task.timeSlot || task.bucket, "morning").toLowerCase();
		const sendAt = new Date(`${task.date}T${bucketTimes[bucket] || "09:00"}:00`);
		sendAt.setMinutes(sendAt.getMinutes() - Number(selected));
		return sendAt;
	}

	async function postMobileReminder(action, payload) {
		const endpoint = cleanText(window.APP_CONFIG && window.APP_CONFIG.GOOGLE_SHEETS_WRITE_URL);
		if (!endpoint) throw new Error("Reminder endpoint is not configured.");
		await fetch(endpoint, {
			method: "POST",
			mode: "no-cors",
			headers: { "Content-Type": "text/plain;charset=UTF-8" },
			body: JSON.stringify({ action, ...payload }),
		});
	}

	function openWeeklyReminder(task) {
		const active = Boolean(task.reminder && task.reminder.active && task.reminder.sendAt);
		const activeDate = active ? new Date(task.reminder.sendAt) : null;
		const customTime = activeDate && !Number.isNaN(activeDate.getTime())
			? `${String(activeDate.getHours()).padStart(2, "0")}:${String(activeDate.getMinutes()).padStart(2, "0")}`
			: "09:00";
		const content = openModal(`
			<h2 id="mobile-modal-title">Send Reminder</h2><p>${escapeHtml(task.title)}</p>
			<form class="modal-form reminder-form" data-reminder-form>
				<label class="radio-option"><input type="radio" name="reminderOffset" value="10" checked>10 minutes before</label>
				<label class="radio-option"><input type="radio" name="reminderOffset" value="30">30 minutes before</label>
				<label class="radio-option"><input type="radio" name="reminderOffset" value="60">1 hour before</label>
				<label class="radio-option"><input type="radio" name="reminderOffset" value="custom">Custom time</label>
				<label>Custom time<input type="time" name="customTime" value="${customTime}"></label>
				<div class="status-message" data-modal-status></div>
				<div class="modal-actions">${active ? '<button type="button" class="danger-action" data-reminder-delete>Delete Reminder</button>' : ""}<button type="button" class="secondary-action" data-modal-cancel>Cancel</button><button type="submit" class="primary-action">${active ? "Reset Reminder" : "Send Reminder"}</button></div>
			</form>
		`);
		const form = content.querySelector("[data-reminder-form]");
		content.querySelector("[data-modal-cancel]").addEventListener("click", closeModal);
		form.elements.customTime.addEventListener("focus", () => { form.querySelector("[value='custom']").checked = true; });
		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			try {
				const sendAt = reminderSendAt(task, form);
				const config = window.APP_CONFIG || {};
				const payload = { taskId: task.id, phoneNumber: cleanText(config.USER_PHONE_NUMBER), smsGateway: cleanText(config.USER_SMS_GATEWAY), message: `Reminder: ${task.title}` };
				if (active) payload.newSendAt = sendAt.toISOString();
				else payload.sendAt = sendAt.toISOString();
				await postMobileReminder(active ? "resetReminder" : "sendReminder", payload);
				const saved = await window.PlannerStorage.upsertWeeklyTask({ ...task, reminder: { active: true, sendAt: sendAt.toISOString() } });
				Object.assign(task, saved);
				closeModal();
				renderWeeklyPlanner();
			} catch (error) {
				form.querySelector("[data-modal-status]").textContent = cleanText(error.message, "Unable to set reminder.");
			}
		});
		content.querySelector("[data-reminder-delete]")?.addEventListener("click", async () => {
			try {
				await postMobileReminder("deleteReminder", { taskId: task.id });
				const saved = await window.PlannerStorage.upsertWeeklyTask({ ...task, reminder: { active: false } });
				Object.assign(task, saved);
				closeModal();
				renderWeeklyPlanner();
			} catch (error) {
				form.querySelector("[data-modal-status]").textContent = cleanText(error.message, "Unable to delete reminder.");
			}
		});
	}

	function openWeekMove(task) {
		const content = openModal(`<h2 id="mobile-modal-title">Move Task to Week</h2><p>${escapeHtml(task.title)}</p><form class="modal-form" data-week-move-form><label>Week<select name="offset"><option value="-1">Last Week</option><option value="0" selected>This Week</option><option value="1">Next Week</option></select></label><div class="status-message" data-modal-status></div><div class="modal-actions"><button type="button" class="secondary-action" data-modal-cancel>Cancel</button><button type="submit" class="primary-action">Move</button></div></form>`);
		const form = content.querySelector("[data-week-move-form]");
		content.querySelector("[data-modal-cancel]").addEventListener("click", closeModal);
		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			try {
				const offset = Number(new FormData(form).get("offset"));
				const saved = await window.PlannerStorage.upsertWeeklyTask({ ...task, date: addDays(task.date, offset * 7) });
				Object.assign(task, saved);
				closeModal();
				renderWeeklyPlanner();
			} catch (error) {
				form.querySelector("[data-modal-status]").textContent = cleanText(error.message, "Unable to move task.");
			}
		});
	}

	function openAdhocChecklistModal(task) {
		const renderContent = () => {
			const checklist = normalizedChecklist(task);
			return `<h2 id="mobile-modal-title">Checklist</h2><p>${escapeHtml(task.title)}</p><div class="checklist-body">${checklist.length ? checklist.map((entry) => `<div class="checklist-item${entry.completed ? " is-complete" : ""}"><input type="checkbox" data-checklist-toggle data-check-id="${escapeHtml(entry.id)}" ${entry.completed ? "checked" : ""}><span>${escapeHtml(entry.text)}</span><button type="button" data-checklist-remove data-check-id="${escapeHtml(entry.id)}" aria-label="Remove ${escapeHtml(entry.text)}"><span class="material-symbols-rounded">close</span></button></div>`).join("") : '<div class="empty-state">No sub-tasks yet.</div>'}<div class="checklist-add"><input type="text" data-checklist-input placeholder="Add sub-task" aria-label="Add sub-task"><button type="button" data-checklist-add-button>Add</button></div></div><div class="modal-actions"><button type="button" class="secondary-action" data-modal-cancel>Close</button></div>`;
		};

		const content = openModal(renderContent());

		const bindHandlers = () => {
			content.querySelector("[data-modal-cancel]").addEventListener("click", closeModal);
			const refresh = () => {
				if (!content.isConnected) return;
				content.innerHTML = renderContent();
				bindHandlers();
			};
			content.querySelectorAll("[data-checklist-toggle]").forEach((checkbox) => {
				checkbox.addEventListener("change", async () => {
					await updateWeeklyChecklist(task, (checklist) => ({ checklist: checklist.map((entry) => entry.id === checkbox.dataset.checkId ? { ...entry, completed: checkbox.checked } : entry) }));
					refresh();
				});
			});
			content.querySelectorAll("[data-checklist-remove]").forEach((button) => {
				button.addEventListener("click", async () => {
					await updateWeeklyChecklist(task, (checklist) => ({ checklist: checklist.filter((entry) => entry.id !== button.dataset.checkId) }));
					refresh();
				});
			});
			const input = content.querySelector("[data-checklist-input]");
			const addItem = async () => {
				const text = cleanText(input && input.value);
				if (!text) return;
				await updateWeeklyChecklist(task, (checklist) => ({ checklist: [...checklist, { id: makeId("check"), text, completed: false }] }));
				refresh();
			};
			content.querySelector("[data-checklist-add-button]").addEventListener("click", addItem);
			input.addEventListener("keydown", (event) => {
				if (event.key !== "Enter") return;
				event.preventDefault();
				addItem();
			});
		};

		bindHandlers();
	}


	function openParkingConversion(item) {
		const content = openModal(`
			<h2 id="mobile-modal-title">Convert Parking Lot Item</h2>
			<p>${escapeHtml(item.title)}</p>
			<form class="modal-form" data-convert-parking-form>
				<label>Convert To<select name="convertTo"><option value="project">Project</option><option value="task-manager">Ad-Hoc</option><option value="repeatable">Repeatable</option></select></label>
				<div class="status-message" data-modal-status></div>
				<div class="modal-actions"><button type="button" class="secondary-action" data-modal-cancel>Cancel</button><button type="submit" class="primary-action">Convert</button></div>
			</form>
		`);
		content.querySelector("[data-modal-cancel]").addEventListener("click", closeModal);
		content.querySelector("[data-convert-parking-form]").addEventListener("submit", async (event) => {
			event.preventDefault();
			const form = event.currentTarget;
			const convertTo = new FormData(form).get("convertTo");
			const submitButton = form.querySelector("[type='submit']");
			const status = form.querySelector("[data-modal-status]");
			submitButton.disabled = true;
			status.textContent = "Converting item...";
			try {
				await removePreviousParkingConversion(item, convertTo);
				let convertedTo;
				let color;
				if (convertTo === "task-manager") {
					const task = await window.PlannerStorage.upsertTaskManagerTask({
						id: item.id,
						taskId: item.id,
						projectId: item.id,
						title: item.title,
						source: "parking-lot",
						category: "uncategorized",
						state: "unknown",
						priority: 3,
					});
					convertedTo = { type: "task-manager", id: cleanText(task.id || task.taskId, item.id) };
					color = "#0f766e";
				} else {
					const result = await window.ProjectsService.createProject({
						source: convertTo === "repeatable" ? "repeating" : "home",
						title: item.title,
						category: "uncategorized",
						state: "unknown",
						priority: "3",
						addToRepeating: convertTo === "repeatable",
					});
					convertedTo = {
						type: convertTo,
						id: cleanText(result.id, item.id),
						tabName: cleanText(result.tabName),
						rowNumber: result.rowNumber,
						sheetSource: convertTo === "repeatable" ? "repeating" : "home",
					};
					const verified = await ensureLinkedParkingProject(item.title, convertedTo.sheetSource, convertedTo);
					convertedTo.rowNumber = verified.rowNumber || convertedTo.rowNumber;
					color = "#7c3aed";
				}
				const saved = await window.PlannerStorage.upsertParkingItem({
					...item,
					convertedTo,
					color,
					metadataJson: parkingMetadataWithConversion(item, convertedTo),
				});
				Object.assign(item, saved);
				closeModal();
				renderParkingLot();
			} catch (error) {
				status.textContent = cleanText(error && error.message, "Unable to convert parking lot item.");
				submitButton.disabled = false;
			}
		});
	}

	async function removePreviousParkingConversion(item, targetType) {
		const previous = item.convertedTo && typeof item.convertedTo === "object" ? item.convertedTo : null;
		const previousType = cleanText(previous && previous.type);
		if (!previousType || previousType === targetType) return;
		if (previousType === "task-manager") {
			await window.PlannerStorage.deleteTaskManagerTask(previous.id);
			return;
		}
		if (previousType === "project" || previousType === "repeatable") {
			await window.SheetsService.deleteProject({
				id: previous.id,
				source: cleanText(previous.sheetSource, previousType === "repeatable" ? "repeating" : "home"),
				tabName: cleanText(previous.tabName),
				metadata: { sheetRowNumber: Number(previous.rowNumber || 0) },
				title: item.title,
			});
		}
	}
	function openAdHocTask() {
		const content = openModal(`
			<h2 id="mobile-modal-title">Add Ad-Hoc Task</h2><p>Add directly to the weekly plan.</p>
			<form class="modal-form" data-adhoc-form><label>Title<input name="title" required></label><label>Date<input type="date" name="date" value="${toDateKey(new Date())}" required></label><label>Time of day<select name="timeSlot"><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select></label><div class="status-message" data-modal-status></div><div class="modal-actions"><button type="button" class="secondary-action" data-modal-cancel>Cancel</button><button type="submit" class="primary-action">Add Task</button></div></form>
		`);
		content.querySelector("[data-modal-cancel]").addEventListener("click", closeModal);
		content.querySelector("[data-adhoc-form]").addEventListener("submit", async (event) => {
			event.preventDefault();
			const form = new FormData(event.currentTarget);
			try {
				const task = await window.PlannerStorage.upsertWeeklyTask({ id: makeId("adhoc"), taskType: "adhoc", title: form.get("title"), date: form.get("date"), timeSlot: form.get("timeSlot"), bucket: form.get("timeSlot"), completed: false });
				state.planner.tasks.push(task);
				state.planner.weekStartDate = mondayOf(task.date);
				closeModal();
				renderWeeklyPlanner();
			} catch (error) {
				content.querySelector("[data-modal-status]").textContent = cleanText(error.message, "Unable to add task.");
			}
		});
	}

	function openParkingEditor(item) {
		const conversion = item.convertedTo && typeof item.convertedTo === "object" ? item.convertedTo : null;
		const isProjectConversion = conversion && (conversion.type === "project" || conversion.type === "repeatable");
		const currentSource = isProjectConversion
			? cleanText(conversion.sheetSource, conversion.type === "repeatable" ? "repeating" : "home")
			: "";
		const sourceField = isProjectConversion
			? `<label>Source<select name="source"><option value="home"${currentSource === "home" ? " selected" : ""}>Home</option><option value="vehicle"${currentSource === "vehicle" ? " selected" : ""}>Vehicle/Small Engine</option><option value="repeating"${currentSource === "repeating" ? " selected" : ""}>Repeatable</option></select></label>`
			: "";
		const content = openModal(`<h2 id="mobile-modal-title">Edit Parking Lot Item</h2><form class="modal-form" data-parking-form><label>Title<input name="title" value="${escapeHtml(item.title)}" required></label><label>Notes<textarea name="notes">${escapeHtml(item.notes)}</textarea></label><label>Priority<select name="priority">${["", "low", "medium", "high"].map((value) => `<option value="${value}"${cleanText(item.priority) === value ? " selected" : ""}>${value || "None"}</option>`).join("")}</select></label>${sourceField}<div class="status-message" data-modal-status></div><div class="modal-actions"><button type="button" class="secondary-action" data-modal-cancel>Cancel</button><button type="submit" class="primary-action">Save</button></div></form>`);
		content.querySelector("[data-modal-cancel]").addEventListener("click", closeModal);
		content.querySelector("[data-parking-form]").addEventListener("submit", async (event) => {
			event.preventDefault();
			const formElement = event.currentTarget;
			const form = new FormData(formElement);
			const status = formElement.querySelector("[data-modal-status]");
			const submitButton = formElement.querySelector("[type='submit']");
			const nextTitle = cleanText(form.get("title"), item.title);
			const nextSource = isProjectConversion ? cleanText(form.get("source"), currentSource) : "";
			submitButton.disabled = true;
			try {
				let nextConversion = conversion;
				if (isProjectConversion && nextSource !== currentSource) {
					status.textContent = "Moving project...";
					const result = await window.ProjectsService.createProject({
						source: nextSource,
						title: nextTitle,
						category: "uncategorized",
						state: "unknown",
						priority: "3",
						addToRepeating: nextSource === "repeating",
					});
					nextConversion = {
						...conversion,
						type: nextSource === "repeating" ? "repeatable" : "project",
						id: cleanText(result.id, item.id),
						tabName: cleanText(result.tabName),
						rowNumber: result.rowNumber,
						sheetSource: nextSource,
					};
					const verified = await ensureLinkedParkingProject(nextTitle, nextSource, nextConversion);
					nextConversion.rowNumber = verified.rowNumber || nextConversion.rowNumber;
					await window.SheetsService.deleteProject({
						id: cleanText(conversion.id, item.id),
						source: currentSource,
						metadata: { sheetRowNumber: Number(conversion.rowNumber || 0) },
						title: item.title,
					});
				} else if (isProjectConversion) {
					status.textContent = "Verifying project...";
					const verified = await ensureLinkedParkingProject(nextTitle, nextSource, nextConversion);
					nextConversion = {
						...nextConversion,
						type: nextSource === "repeating" ? "repeatable" : "project",
						rowNumber: verified.rowNumber || nextConversion.rowNumber,
						sheetSource: nextSource,
					};
				}
				const saved = await window.PlannerStorage.upsertParkingItem({
					...item,
					title: nextTitle,
					notes: form.get("notes"),
					priority: form.get("priority"),
					convertedTo: nextConversion,
					metadataJson: parkingMetadataWithConversion(item, nextConversion),
				});
				Object.assign(item, saved);
				closeModal();
				renderParkingLot();
			} catch (error) {
				status.textContent = cleanText(error.message, "Unable to save item.");
				submitButton.disabled = false;
			}
		});
	}

	function confirmParkingRemoval(item) {
		const content = openModal(`<h2 id="mobile-modal-title">Remove from Parking Lot?</h2><p>${escapeHtml(item.title)}</p><div class="status-message" data-modal-status></div><div class="modal-actions"><button type="button" class="secondary-action" data-modal-cancel>Cancel</button><button type="button" class="danger-action" data-confirm-remove>Remove</button></div>`);
		content.querySelector("[data-modal-cancel]").addEventListener("click", closeModal);
		content.querySelector("[data-confirm-remove]").addEventListener("click", async () => {
			try {
				await window.PlannerStorage.deleteParkingItem(item.id, { hardDelete: true });
				state.parking = state.parking.filter((entry) => entry !== item);
				closeModal();
				renderParkingLot();
			} catch (error) {
				content.querySelector("[data-modal-status]").textContent = cleanText(error.message, "Unable to remove item.");
			}
		});
	}

	async function toggleWeeklyTask(task) {
		try {
			const saved = await window.PlannerStorage.upsertWeeklyTask({ ...task, completed: !task.completed });
			Object.assign(task, saved);
			renderWeeklyPlanner();
		} catch (error) {
			showError(error);
		}
	}

	function openWeeklyEditor(task) {
		const content = openModal(`<h2 id="mobile-modal-title">Edit Planned Task</h2><form class="modal-form" data-week-form><label>Title<input name="title" value="${escapeHtml(task.title)}" required></label><label>Date<input type="date" name="date" value="${escapeHtml(task.date)}" required></label><label>Time of day<select name="timeSlot">${["morning", "afternoon", "evening"].map((value) => `<option value="${value}"${cleanText(task.timeSlot || task.bucket) === value ? " selected" : ""}>${value[0].toUpperCase() + value.slice(1)}</option>`).join("")}</select></label><div class="status-message" data-modal-status></div><div class="modal-actions"><button type="button" class="secondary-action" data-modal-cancel>Cancel</button><button type="submit" class="primary-action">Save</button></div></form>`);
		content.querySelector("[data-modal-cancel]").addEventListener("click", closeModal);
		content.querySelector("[data-week-form]").addEventListener("submit", async (event) => {
			event.preventDefault();
			const form = new FormData(event.currentTarget);
			try {
				const saved = await window.PlannerStorage.upsertWeeklyTask({ ...task, title: form.get("title"), date: form.get("date"), timeSlot: form.get("timeSlot"), bucket: form.get("timeSlot") });
				Object.assign(task, saved);
				closeModal();
				renderWeeklyPlanner();
			} catch (error) {
				content.querySelector("[data-modal-status]").textContent = cleanText(error.message, "Unable to save task.");
			}
		});
	}

	function confirmWeeklyRemoval(task) {
		const content = openModal(`<h2 id="mobile-modal-title">Remove planned task?</h2><p>${escapeHtml(task.title)}</p><div class="status-message" data-modal-status></div><div class="modal-actions"><button type="button" class="secondary-action" data-modal-cancel>Cancel</button><button type="button" class="danger-action" data-confirm-remove>Remove</button></div>`);
		content.querySelector("[data-modal-cancel]").addEventListener("click", closeModal);
		content.querySelector("[data-confirm-remove]").addEventListener("click", async () => {
			try {
				await window.PlannerStorage.deleteWeeklyTask(task.id || task.taskId, { hardDelete: true });
				state.planner.tasks = state.planner.tasks.filter((entry) => entry !== task);
				closeModal();
				renderWeeklyPlanner();
			} catch (error) {
				content.querySelector("[data-modal-status]").textContent = cleanText(error.message, "Unable to remove task.");
			}
		});
	}

	function storedCalendarToken() {
		let expiry = Number(sessionStorage.getItem(CALENDAR_EXPIRY_KEY) || 0);
		let token = cleanText(sessionStorage.getItem(CALENDAR_TOKEN_KEY));
		if (!token) {
			// Fall back to localStorage in case the token was captured by the /oauth2callback redirect handler.
			expiry = Number(localStorage.getItem(CALENDAR_EXPIRY_KEY) || 0);
			token = cleanText(localStorage.getItem(CALENDAR_TOKEN_KEY));
		}
		if (expiry && expiry <= Date.now()) {
			sessionStorage.removeItem(CALENDAR_TOKEN_KEY);
			sessionStorage.removeItem(CALENDAR_EXPIRY_KEY);
			localStorage.removeItem(CALENDAR_TOKEN_KEY);
			localStorage.removeItem(CALENDAR_EXPIRY_KEY);
			return "";
		}
		return token;
	}

	function gisReady() {
		return Boolean(window.google && window.google.accounts && window.google.accounts.oauth2);
	}

	function waitForGoogleIdentityServices(timeoutMs) {
		return new Promise((resolve, reject) => {
			const startedAt = Date.now();
			const check = () => {
				if (gisReady()) return resolve();
				if (Date.now() - startedAt > (timeoutMs || 8000)) return reject(new Error("Google Identity Services failed to load."));
				window.setTimeout(check, 120);
			};
			check();
		});
	}

	async function ensureGoogleIdentityServices() {
		if (gisReady()) return;

		try {
			await waitForGoogleIdentityServices(8000);
			return;
		} catch (error) {
			// Re-inject the script below in case the deferred tag never loaded.
		}

		await new Promise((resolve, reject) => {
			const existing = document.querySelector("script[data-gis-retry]");
			if (existing) return resolve();
			const script = document.createElement("script");
			script.src = "https://accounts.google.com/gsi/client";
			script.async = true;
			script.dataset.gisRetry = "true";
			script.onload = resolve;
			script.onerror = () => reject(new Error("Unable to reach Google sign-in. Check the device's internet connection."));
			document.head.appendChild(script);
		});

		await waitForGoogleIdentityServices(8000);
	}

	function storeCalendarToken(accessToken, expiresInSeconds) {
		const expiresAt = String(Date.now() + (Number(expiresInSeconds) || 3600) * 1000);
		sessionStorage.setItem(CALENDAR_TOKEN_KEY, accessToken);
		sessionStorage.setItem(CALENDAR_EXPIRY_KEY, expiresAt);
		localStorage.setItem(CALENDAR_TOKEN_KEY, accessToken);
		localStorage.setItem(CALENDAR_EXPIRY_KEY, expiresAt);
	}

	async function initTokenClient() {
		if (state.tokenClient) return state.tokenClient;
		const clientId = cleanText(window.APP_CONFIG?.GOOGLE_CLIENT_ID);
		if (!clientId) throw new Error("Google Calendar client ID is not configured.");
		await ensureGoogleIdentityServices();
		// redirect_uri keeps the consent screen inside the WebView (via onCreateWindow) instead of relying on a popup window.
		state.tokenClient = window.google.accounts.oauth2.initTokenClient({
			client_id: clientId,
			scope: CALENDAR_SCOPES,
			response_type: "token",
			redirect_uri: "https://localhost/oauth2callback",
			callback: (response) => {
				if (!response || response.error) return;
				const accessToken = cleanText(response.access_token);
				if (!accessToken) return;
				storeCalendarToken(accessToken, response.expires_in);
			},
			error_callback: (error) => {
				console.warn("Google sign-in was cancelled or blocked.", error);
			},
		});
		return state.tokenClient;
	}

	async function requestCalendarToken() {
		const client = await initTokenClient();
		return new Promise((resolve, reject) => {
			client.callback = (response) => {
				if (!response || response.error) return reject(new Error(cleanText(response && (response.error_description || response.error), "Google authentication failed.")));
				const accessToken = cleanText(response.access_token);
				if (!accessToken) return reject(new Error("Google authentication returned no access token."));
				storeCalendarToken(accessToken, response.expires_in);
				resolve(accessToken);
			};
			client.error_callback = (error) => reject(new Error(cleanText(error && (error.message || error.type), "Google sign-in was cancelled or blocked.")));
			try {
				client.requestAccessToken({ prompt: storedCalendarToken() ? "" : "consent" });
			} catch (error) {
				reject(error);
			}
		});
	}

	async function initCalendar(loadId) {
		document.getElementById("mobile-calendar-signin")?.addEventListener("click", async () => {
			try {
				await requestCalendarToken();
				await loadCalendarEvents(loadId);
			} catch (error) {
				showError(error);
			}
		});
		document.getElementById("mobile-month-prev")?.addEventListener("click", () => changeMonth(-1));
		document.getElementById("mobile-month-next")?.addEventListener("click", () => changeMonth(1));
		document.getElementById("mobile-month-grid")?.addEventListener("click", (event) => {
			const day = event.target.closest("[data-date]");
			if (!day) return;
			state.selectedDate = day.dataset.date;
			renderMonthGrid();
			renderAgenda();
		});
		document.getElementById("mobile-agenda-list")?.addEventListener("click", (event) => {
			const button = event.target.closest("[data-event-id]");
			if (button) openEventDetails(button.dataset.eventId);
		});
		renderMonthGrid();
		renderAgenda();
		if (storedCalendarToken()) await loadCalendarEvents(loadId);
	}

	function changeMonth(amount) {
		state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() + amount, 1);
		state.selectedDate = toDateKey(state.calendarMonth);
		renderMonthGrid();
		renderAgenda();
		if (storedCalendarToken()) loadCalendarEvents(state.loadId).catch(showError);
	}

	function eventDateKey(event) {
		return cleanText(event?.start?.date) || toDateKey(event?.start?.dateTime);
	}

	async function loadCalendarEvents(loadId) {
		const token = storedCalendarToken();
		if (!token) return;
		const monthStart = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth(), 1);
		const monthEnd = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() + 1, 1);
		const query = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", maxResults: "2500", timeMin: monthStart.toISOString(), timeMax: monthEnd.toISOString(), showDeleted: "false" });
		const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${query}`, { headers: { Authorization: `Bearer ${token}` } });
		if (response.status === 401) {
			sessionStorage.removeItem(CALENDAR_TOKEN_KEY);
			sessionStorage.removeItem(CALENDAR_EXPIRY_KEY);
			throw new Error("Google Calendar session expired. Sign in again.");
		}
		if (!response.ok) throw new Error(`Google Calendar request failed (${response.status}).`);
		const payload = await response.json();
		if (loadId !== state.loadId || state.screen !== "calendar") return;
		state.calendarEvents = Array.isArray(payload.items) ? payload.items : [];
		renderMonthGrid();
		renderAgenda();
	}

	function renderMonthGrid() {
		const grid = document.getElementById("mobile-month-grid");
		if (!grid) return;
		document.getElementById("mobile-month-label").textContent = state.calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
		const first = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth(), 1);
		const gridStart = new Date(first);
		gridStart.setDate(first.getDate() - first.getDay());
		const eventDates = new Set(state.calendarEvents.map(eventDateKey));
		const today = toDateKey(new Date());
		grid.innerHTML = Array.from({ length: 42 }, (_, index) => {
			const date = new Date(gridStart);
			date.setDate(gridStart.getDate() + index);
			const key = toDateKey(date);
			const classes = ["calendar-day"];
			if (date.getMonth() !== state.calendarMonth.getMonth()) classes.push("is-outside");
			if (key === today) classes.push("is-today");
			if (key === state.selectedDate) classes.push("is-selected");
			if (eventDates.has(key)) classes.push("has-events");
			return `<button type="button" class="${classes.join(" ")}" data-date="${key}" aria-label="${date.toLocaleDateString()}">${date.getDate()}</button>`;
		}).join("");
	}

	function renderAgenda() {
		const list = document.getElementById("mobile-agenda-list");
		if (!list) return;
		document.getElementById("mobile-agenda-date").textContent = parseDateKey(state.selectedDate).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
		const events = state.calendarEvents.filter((event) => eventDateKey(event) === state.selectedDate);
		list.innerHTML = events.length ? events.map((event) => `
			<button type="button" class="mobile-card" style="--card-accent:${escapeHtml(event.colorId ? "#2563eb" : "#087f73")}" data-event-id="${escapeHtml(event.id)}">
				<h3>${escapeHtml(event.summary || "Untitled event")}</h3><div class="card-meta"><span>${escapeHtml(formatEventTime(event))}</span></div>
			</button>
		`).join("") : `<div class="empty-state">${storedCalendarToken() ? "No events for this day." : "Sign in to load Google Calendar events."}</div>`;
	}

	function formatEventTime(event) {
		if (event?.start?.date) return "All day";
		const date = new Date(event?.start?.dateTime || "");
		return Number.isNaN(date.getTime()) ? "Time unavailable" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
	}

	function openEventDetails(eventId) {
		const event = state.calendarEvents.find((item) => cleanText(item.id) === eventId);
		if (!event) return;
		const content = openModal(`
			<h2 id="mobile-modal-title">${escapeHtml(event.summary || "Untitled event")}</h2>
			<p>${escapeHtml(parseDateKey(eventDateKey(event)).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))} · ${escapeHtml(formatEventTime(event))}</p>
			${event.location ? `<p><strong>Location:</strong> ${escapeHtml(event.location)}</p>` : ""}
			${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}
			<div class="status-message" data-modal-status></div>
			<div class="modal-actions"><button type="button" class="secondary-action" data-modal-cancel>Close</button><button type="button" class="primary-action" data-add-event-planner>Add to Planner</button></div>
		`);
		content.querySelector("[data-modal-cancel]").addEventListener("click", closeModal);
		content.querySelector("[data-add-event-planner]").addEventListener("click", async () => {
			try {
				const date = eventDateKey(event);
				const hour = event?.start?.dateTime ? new Date(event.start.dateTime).getHours() : 9;
				const timeSlot = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
				await window.PlannerStorage.upsertWeeklyTask({ id: `calendar-${event.id}-${date}`, taskType: "calendar", title: event.summary || "Untitled event", date, timeSlot, bucket: timeSlot, completed: false, metadata: { calendarEventId: event.id } });
				closeModal();
			} catch (error) {
				content.querySelector("[data-modal-status]").textContent = cleanText(error.message, "Unable to add event to Planner.");
			}
		});
	}

	async function start() {
		initNav();
		try {
			state.modalTemplate = await fetchFragment("components/modal.html");
		} catch (error) {
			console.warn("Mobile modal template unavailable; using fallback.", error);
		}
		const requested = location.hash.replace(/^#/, "");
		await loadScreen(SCREEN_NAMES.includes(requested) ? requested : "workbench");
	}

	// Handles the GIS redirect back from the consent screen (window.location.pathname === "/oauth2callback").
	// Must run before any UI renders so the WebView never shows a blank page after "Continue".
	function handleOAuthRedirect() {
		if (window.location.pathname !== "/oauth2callback") return false;
		try {
			const fragment = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
			const params = new URLSearchParams(fragment || window.location.search.replace(/^\?/, ""));
			const accessToken = cleanText(params.get("access_token"));
			const error = params.get("error");
			if (accessToken) {
				storeCalendarToken(accessToken, params.get("expires_in"));
			} else if (error) {
				console.warn("Google sign-in redirect returned an error:", error);
			}
		} catch (error) {
			console.warn("Failed to parse the Google sign-in redirect response.", error);
		} finally {
			window.location.replace("/mobile/index.html#calendar");
		}
		return true;
	}

	window.loadScreen = loadScreen;
	window.openModal = openModal;
	window.closeModal = closeModal;
	window.addEventListener("hashchange", () => {
		const requested = location.hash.replace(/^#/, "");
		if (SCREEN_NAMES.includes(requested) && requested !== state.screen) loadScreen(requested);
	});

	if (!handleOAuthRedirect()) start();
})();

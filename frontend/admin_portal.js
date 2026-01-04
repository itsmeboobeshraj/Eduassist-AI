document.addEventListener('DOMContentLoaded', () => {
    // --- AUTHENTICATION CHECK ---
    const token = localStorage.getItem('authToken');
    const collegeId = localStorage.getItem('collegeId');

    if (!token || !collegeId) {
        window.location.href = 'login.html';
        return;
    }

    // --- STATE MANAGEMENT ---
    let currentDocId = null;
    let documents = [];

    // --- ELEMENT SELECTORS ---
    const collegeNameDisplay = document.getElementById('collegeNameDisplay');
    const sidebar = document.getElementById('sidebar');
    const editorPane = document.getElementById('editorPane');
    const placeholder = document.getElementById('placeholder');
    const tabs = document.querySelectorAll('.tab-btn');
    const documentsPane = document.getElementById('documentsPane');
    const settingsPane = document.getElementById('settingsPane');
    const documentList = document.getElementById('documentList');
    const newDocBtn = document.getElementById('newDocBtn');
    const websiteUrlInput = document.getElementById('websiteUrlInput');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const header = document.querySelector('.header');

    // MODIFIED: Contact Input Selectors
    const contactNameInput = document.getElementById('contactNameInput');
    const contactPhoneInput = document.getElementById('contactPhoneInput');
    
    // Custom Modal Selectors
    const modal = document.getElementById('customModal');
    const modalMessage = document.getElementById('modalMessage');
    const modalButtons = document.getElementById('modalButtons');

    const logoutBtn = document.createElement('button');
    logoutBtn.textContent = 'Logout';
    header.appendChild(logoutBtn);

    // --- Custom Modal Functions ---
    function showAlert(message) {
        modalMessage.textContent = message;
        modalButtons.innerHTML = '<button class="modal-btn modal-btn-confirm">OK</button>';
        modal.style.display = 'flex';
        modalButtons.querySelector('.modal-btn-confirm').addEventListener('click', () => modal.style.display = 'none');
    }

    function showConfirm(message) {
        return new Promise((resolve) => {
            modalMessage.textContent = message;
            modalButtons.innerHTML = `
                <button class="modal-btn modal-btn-cancel">Cancel</button>
                <button class="modal-btn modal-btn-confirm">Confirm</button>
            `;
            modal.style.display = 'flex';
            modalButtons.querySelector('.modal-btn-confirm').onclick = () => { modal.style.display = 'none'; resolve(true); };
            modalButtons.querySelector('.modal-btn-cancel').onclick = () => { modal.style.display = 'none'; resolve(false); };
        });
    }

    // --- API HELPER FUNCTIONS ---
    const API_BASE_URL = 'http://localhost:3001/api';

    async function apiFetch(url, options = {}) {
        const headers = { 'Authorization': `Bearer ${token}` };
        if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
        const response = await fetch(url, { ...options, headers });
        if ([401, 403].includes(response.status)) {
            localStorage.clear();
            window.location.href = 'login.html';
            throw new Error('Authentication error.');
        }
        return response;
    }
    
    // --- CORE LOGIC ---
    async function fetchCollegeDetails() {
        try {
            const response = await apiFetch(`${API_BASE_URL}/college/${collegeId}`);
            if (!response.ok) throw new Error('Failed to fetch college details.');
            const college = await response.json();
            collegeNameDisplay.textContent = college.name;
            websiteUrlInput.value = college.website_url || '';
            contactNameInput.value = college.staff_contact_name || '';
            // MODIFIED: Populate phone field
            contactPhoneInput.value = college.staff_contact_phone || '';
        } catch (error) { 
            console.error(error);
            collegeNameDisplay.textContent = 'Error Loading College';
        }
    }

    async function fetchDocumentsForCollege() {
        try {
            const response = await apiFetch(`${API_BASE_URL}/documents/${collegeId}`);
            documents = await response.json();
            renderDocumentList();
        } catch (error) { console.error(error); }
    }

    async function fetchDocumentContent(docId) {
        try {
            const response = await apiFetch(`${API_BASE_URL}/document/${docId}`);
            const doc = await response.json();
            renderEditor(doc);
        } catch (error) { console.error(error); }
    }

    function renderDocumentList() {
        documentList.innerHTML = '';
        documents.forEach(doc => {
            const li = document.createElement('li');
            li.className = 'doc-list-item';
            li.textContent = doc.title;
            li.dataset.docId = doc.id;
            if (doc.id === currentDocId) li.classList.add('active');
            documentList.appendChild(li);
        });
    }

    function renderEditor(doc) {
        editorPane.innerHTML = `
            <input type="text" id="docTitle" placeholder="Document Title" value="${doc.title}">
            <textarea id="docContent" placeholder="Paste or upload content...">${doc.content || ''}</textarea>
            <div class="editor-actions">
                <div>
                    <button class="action-btn save-btn" id="saveBtn">Save Changes</button>
                    <button class="action-btn delete-btn" id="deleteBtn">Delete Document</button>
                </div>
                <div class="upload-section">
                    <input type="file" id="fileUpload" accept=".pdf,.png,.jpg,.jpeg,.txt" style="display:none;">
                    <label for="fileUpload" class="upload-btn">Upload & Append File</label>
                </div>
            </div>`;
        editorPane.classList.add('visible');
        placeholder.style.display = 'none';
        document.getElementById('saveBtn').addEventListener('click', onSave);
        document.getElementById('deleteBtn').addEventListener('click', onDelete);
        document.getElementById('fileUpload').addEventListener('change', onUpload);
    }

    function showPlaceholder(message) {
        editorPane.classList.remove('visible');
        placeholder.style.display = 'flex';
        placeholder.querySelector('h2').textContent = message;
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            documentsPane.classList.toggle('active', tab.dataset.tab === 'documents');
            settingsPane.classList.toggle('active', tab.dataset.tab === 'settings');
        });
    });

    documentList.addEventListener('click', (e) => {
        if (e.target.matches('li.doc-list-item')) {
            currentDocId = parseInt(e.target.dataset.docId);
            renderDocumentList();
            fetchDocumentContent(currentDocId);
        }
    });

    newDocBtn.addEventListener('click', async () => {
        const title = prompt("Enter a title for the new document:");
        if (title && collegeId) {
            try {
                const res = await apiFetch(`${API_BASE_URL}/documents`, {
                    method: 'POST',
                    body: JSON.stringify({ collegeId: parseInt(collegeId), title })
                });
                if (!res.ok) throw new Error('Server error.');
                const newDoc = await res.json();
                currentDocId = newDoc.id;
                await fetchDocumentsForCollege();
                fetchDocumentContent(currentDocId);
            } catch (error) { showAlert('Could not create document.'); }
        }
    });

    // MODIFIED: Save settings handler now sends phone number
    saveSettingsBtn.addEventListener('click', async () => {
        if (!collegeId) return;
        const settingsPayload = {
            website_url: websiteUrlInput.value,
            staff_contact_name: contactNameInput.value,
            staff_contact_phone: contactPhoneInput.value,
        };
        try {
            const res = await apiFetch(`${API_BASE_URL}/college/${collegeId}`, {
                method: 'PUT',
                body: JSON.stringify(settingsPayload)
            });
            if (!res.ok) throw new Error('Server error.');
            showAlert('Settings saved successfully!');
        } catch (error) { showAlert('Error saving settings.'); }
    });
    
    logoutBtn.addEventListener('click', () => {
        localStorage.clear();
        window.location.href = 'login.html';
    });

    async function onSave() {
        const payload = {
            title: document.getElementById('docTitle').value,
            content: document.getElementById('docContent').value,
        };
        try {
            await apiFetch(`${API_BASE_URL}/document/${currentDocId}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            showAlert('Document saved!');
            await fetchDocumentsForCollege();
        } catch (error) { showAlert('Error saving document.'); }
    }

    async function onDelete() {
        if (await showConfirm('Are you sure you want to delete this document?')) {
            try {
                await apiFetch(`${API_BASE_URL}/document/${currentDocId}`, { method: 'DELETE' });
                currentDocId = null;
                await fetchDocumentsForCollege();
                showPlaceholder('Document deleted.');
            } catch (error) { showAlert('Error deleting document.'); }
        }
    }

    async function onUpload(event) {
        const file = event.target.files[0];
        if (!file || !currentDocId) return;
        const formData = new FormData();
        formData.append('documentFile', file);
        showAlert('Processing file...');
        try {
            const response = await apiFetch(`${API_BASE_URL}/upload/${currentDocId}`, {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) throw new Error(await response.text());
            const result = await response.json();
            document.getElementById('docContent').value = result.content;
            showAlert('File content appended successfully!');
        } catch (error) { showAlert(`Error: ${error.message}`); }
        finally { event.target.value = ''; }
    }

    function initializePortal() {
        sidebar.style.display = 'block';
        showPlaceholder('Select a document or manage settings.');
        fetchCollegeDetails();
        fetchDocumentsForCollege();
    }

    initializePortal();
});


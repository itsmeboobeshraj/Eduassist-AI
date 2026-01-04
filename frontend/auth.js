document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://localhost:3001/api';

    // --- ELEMENT SELECTORS ---
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const collegeSelect = document.getElementById('collegeSelect');
    const errorMessageDiv = document.getElementById('error-message');
    const tabs = document.querySelectorAll('.tab');
    const forms = document.querySelectorAll('.auth-form');
    
    // Custom Modal Selectors
    const modal = document.getElementById('customModal');
    const modalMessage = document.getElementById('modalMessage');
    const modalButtons = document.getElementById('modalButtons');

    // --- MODAL & ERROR FUNCTIONS ---
    function showAlert(message) {
        modalMessage.textContent = message;
        modalButtons.innerHTML = '<button class="modal-btn modal-btn-confirm">OK</button>';
        modal.style.display = 'flex';
        
        modalButtons.querySelector('.modal-btn-confirm').addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }
    
    function showError(message) {
        errorMessageDiv.textContent = message;
        errorMessageDiv.style.display = 'block';
    }

    function hideError() {
        errorMessageDiv.style.display = 'none';
    }

    // --- CORE LOGIC ---
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const tabName = tab.dataset.tab;
            forms.forEach(form => {
                form.id === `${tabName}-form` ? form.classList.add('active') : form.classList.remove('active');
            });
            hideError();
        });
    });

    async function populateColleges() {
        try {
            const response = await fetch(`${API_BASE_URL}/colleges`);
            if (!response.ok) throw new Error('Could not load colleges.');
            
            const colleges = await response.json();
            collegeSelect.innerHTML = '<option value="">-- Select a College --</option>';
            colleges.forEach(college => {
                const option = document.createElement('option');
                option.value = college.id;
                option.textContent = college.name;
                collegeSelect.appendChild(option);
            });
        } catch (error) {
            collegeSelect.innerHTML = '<option value="">Error loading colleges</option>';
            console.error(error);
        }
    }
    
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideError();
            
            const collegeId = collegeSelect.value;
            const username = document.getElementById('registerUsername').value;
            const password = document.getElementById('registerPassword').value;

            if (!collegeId) {
                showError('Please select a college.');
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ collegeId, username, password })
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(errorText || 'Registration failed.');
                }
                
                showAlert('Registration successful! Please log in.');
                document.querySelector('.tab[data-tab="login"]').click();

            } catch (error) {
                showError(error.message);
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideError();

            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;

            try {
                const response = await fetch(`${API_BASE_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(errorText || 'Invalid credentials.');
                }

                const data = await response.json();
                localStorage.setItem('authToken', data.accessToken);
                localStorage.setItem('collegeId', data.collegeId);
                window.location.href = 'index.html';

            } catch (error) {
                showError(error.message);
            }
        });
    }

    populateColleges();
});


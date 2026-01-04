document.addEventListener('DOMContentLoaded', () => {
    // --- API & STATE ---
    const API_BASE_URL = 'http://localhost:3001/api';
    let selectedCollegeId = null;

    // --- ELEMENT SELECTORS ---
    const collegeSelect = document.getElementById('collegeSelectChat');
    const chatMessages = document.getElementById('chatMessages');
    const chatForm = document.getElementById('chatForm');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');

    // --- HELPER FUNCTIONS ---

    // Adds a message to the chat window and scrolls down
    function addMessage(text, sender) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${sender}`;
        messageElement.textContent = text;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Shows or hides the typing indicator
    function showTypingIndicator(show) {
        let typingIndicator = document.querySelector('.message.loading');
        if (show) {
            if (!typingIndicator) {
                typingIndicator = document.createElement('div');
                typingIndicator.className = 'message loading';
                typingIndicator.innerHTML = `
                    <div class="typing-indicator">
                        <span></span><span></span><span></span>
                    </div>`;
                chatMessages.appendChild(typingIndicator);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        } else {
            if (typingIndicator) {
                typingIndicator.remove();
            }
        }
    }


    // --- CORE LOGIC ---

    // Fetches colleges from the server and populates the dropdown
    async function populateColleges() {
        try {
            const response = await fetch(`${API_BASE_URL}/colleges`);
            if (!response.ok) throw new Error('Could not load colleges.');
            
            const colleges = await response.json();
            colleges.forEach(college => {
                const option = document.createElement('option');
                option.value = college.id;
                option.textContent = college.name;
                collegeSelect.appendChild(option);
            });
        } catch (error) {
            console.error(error);
            addMessage('Sorry, I was unable to load the list of colleges. Please try refreshing the page.', 'bot');
        }
    }

    // Handles the chat form submission
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const question = userInput.value.trim();
        
        if (!question || !selectedCollegeId) return;

        addMessage(question, 'user');
        userInput.value = '';
        showTypingIndicator(true);
        sendBtn.disabled = true;

        try {
            const response = await fetch(`${API_BASE_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, collegeId: selectedCollegeId })
            });

            if (!response.ok) throw new Error('The server is not responding.');

            const data = await response.json();
            addMessage(data.answer, 'bot');

        } catch (error) {
            addMessage('Sorry, I seem to be having trouble connecting. Please try again in a moment.', 'bot');
            console.error(error);
        } finally {
            showTypingIndicator(false);
            sendBtn.disabled = false;
        }
    });

    // Enables the chat input once a college is selected
    collegeSelect.addEventListener('change', () => {
        selectedCollegeId = collegeSelect.value;
        if (selectedCollegeId) {
            userInput.disabled = false;
            sendBtn.disabled = false;
            userInput.placeholder = 'Ask a question...';
            addMessage(`You've selected ${collegeSelect.options[collegeSelect.selectedIndex].text}. How can I help you today?`, 'bot');
        } else {
            userInput.disabled = true;
            sendBtn.disabled = true;
            userInput.placeholder = 'Please select a college first';
        }
    });

    // --- INITIALIZATION ---
    populateColleges();
});


const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const fs = require('fs');
const multer = require('multer');
const pdf = require('pdf-parse');
const { createWorker } = require('tesseract.js');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = 3001;

// --- CONFIGURATION & MIDDLEWARE ---
// Database configuration (centralized so we can reuse/modify it at runtime)
const dbConfig = {
    user: 'postgres',
    host: 'localhost',
    database: 'college_chatbot',
    password: 'Rskb2006@',
    port: 2006,
};

const pool = new Pool(dbConfig);

const API_KEY = 'AIzaSyDsC2Qq1DseAKpyKPV9wmCfoQ70-2UNEHw'; 
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

const upload = multer({ dest: 'uploads/' });
const SECRET_KEY = 'your_super_secret_key_that_should_be_long_and_random';

// ... (All existing code for auth, documents, etc. remains unchanged)
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}
app.post('/api/auth/register', async (req, res) => {
    const { collegeId, username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query('INSERT INTO admins (college_id, username, password_hash) VALUES ($1, $2, $3)', [collegeId, username, hashedPassword]);
        res.status(201).send('Registration successful.');
    } catch (err) {
        if (err.code === '23505') {
            if (err.constraint === 'admins_username_key') return res.status(409).send('Username already exists.');
            if (err.constraint === 'admins_college_id_key') return res.status(409).send('An admin for this college already exists.');
        }
        res.status(500).send('Error registering user.');
    }
});
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(401).send('Invalid credentials.');
        const user = result.rows[0];
        if (await bcrypt.compare(password, user.password_hash)) {
            const accessToken = jwt.sign({ userId: user.id, collegeId: user.college_id }, SECRET_KEY, { expiresIn: '1d' });
            res.json({ accessToken: accessToken, collegeId: user.college_id });
        } else {
            res.status(401).send('Invalid credentials.');
        }
    } catch (err) { res.status(500).send('Error logging in.'); }
});
app.get('/api/colleges', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM colleges ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) { res.status(500).send('Server Error'); }
});
app.get('/api/college/:collegeId', authenticateToken, async (req, res) => {
    const { collegeId } = req.params;
    try {
        const result = await pool.query('SELECT * FROM colleges WHERE id = $1', [collegeId]);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).send('Server Error'); }
});
app.put('/api/college/:collegeId', authenticateToken, async (req, res) => {
    const { collegeId } = req.params;
    const { website_url, staff_contact_name, staff_contact_phone } = req.body;
    try {
        await pool.query('UPDATE colleges SET website_url = $1, staff_contact_name = $2, staff_contact_phone = $3 WHERE id = $4', [website_url, staff_contact_name, staff_contact_phone, collegeId]);
        res.sendStatus(200);
    } catch (err) { res.status(500).send('Server Error'); }
});
app.get('/api/documents/:collegeId', authenticateToken, async (req, res) => {
    const { collegeId } = req.params;
    try {
        const result = await pool.query('SELECT id, title FROM knowledge_documents WHERE college_id = $1 ORDER BY title ASC', [collegeId]);
        res.json(result.rows);
    } catch (err) { res.status(500).send('Server Error'); }
});
app.get('/api/document/:docId', authenticateToken, async (req, res) => {
    const { docId } = req.params;
    try {
        const result = await pool.query('SELECT * FROM knowledge_documents WHERE id = $1', [docId]);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).send('Server Error'); }
});
app.post('/api/documents', authenticateToken, async (req, res) => {
    const { collegeId, title } = req.body;
    try {
        const result = await pool.query('INSERT INTO knowledge_documents (college_id, title, content) VALUES ($1, $2, $3) RETURNING *', [collegeId, title, '']);
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).send('Server Error'); }
});
app.put('/api/document/:docId', authenticateToken, async (req, res) => {
    const { docId } = req.params;
    const { title, content } = req.body;
    try {
        const result = await pool.query('UPDATE knowledge_documents SET title = $1, content = $2, last_modified = NOW() WHERE id = $3 RETURNING *', [title, content, docId]);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).send('Server Error'); }
});
app.delete('/api/document/:docId', authenticateToken, async (req, res) => {
    const { docId } = req.params;
    try {
        await pool.query('DELETE FROM knowledge_documents WHERE id = $1', [docId]);
        res.sendStatus(204);
    } catch (err) { res.status(500).send('Server Error'); }
});
app.post('/api/upload/:docId', authenticateToken, upload.single('documentFile'), async (req, res) => {
    const { docId } = req.params;
    const file = req.file;
    if (!file) return res.status(400).send('No file uploaded.');
    let extractedText = '';
    try {
        if (file.mimetype === 'application/pdf') {
            extractedText = (await pdf(fs.readFileSync(file.path))).text;
        } else if (file.mimetype.startsWith('image/')) {
            const worker = await createWorker('eng');
            const { data: { text } } = await worker.recognize(file.path);
            extractedText = text;
            await worker.terminate();
        } else if (file.mimetype === 'text/plain') {
            extractedText = fs.readFileSync(file.path, 'utf8');
        } else { return res.status(400).send('Unsupported file type.'); }
        const currentDoc = await pool.query('SELECT content FROM knowledge_documents WHERE id = $1', [docId]);
        const newContent = (currentDoc.rows[0].content || '') + `\n\n--- Content from ${file.originalname} ---\n` + extractedText;
        const result = await pool.query('UPDATE knowledge_documents SET content = $1, last_modified = NOW() WHERE id = $2 RETURNING content', [newContent, docId]);
        res.json(result.rows[0]);
    } catch (error) { res.status(500).send('Error processing file.'); } finally { if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path); }
});
app.post('/api/chat/notify-staff', async (req, res) => {
    const { collegeId, question } = req.body;
    try {
        const result = await pool.query('SELECT staff_contact_name, staff_contact_phone FROM colleges WHERE id = $1', [collegeId]);
        if (result.rows.length > 0 && result.rows[0].staff_contact_phone) {
            const staff = result.rows[0];
            console.log(`\n--- STAFF NOTIFICATION (WHATSAPP) ---`);
            console.log(`TO: ${staff.staff_contact_name} at ${staff.staff_contact_phone}`);
            console.log(`MESSAGE: New chatbot query: "${question}"`);
            console.log(`-------------------------------------\n`);
            res.status(200).send('Notification sent.');
        } else { res.status(404).send('Staff contact not found.'); }
    } catch (err) { res.status(500).send('Server Error'); }
});

// --- REBUILT 5.0 (FINAL): The Unified Intelligent Chatbot Endpoint ---
app.post('/api/chat', async (req, res) => {
    const { question, collegeId } = req.body;

    if (!question || !collegeId) {
        return res.status(400).json({ answer: "Error: Missing question or college ID." });
    }

    try {
        // --- Step 1: Fetch College Data ---
        const collegeRes = await pool.query('SELECT * FROM colleges WHERE id = $1', [collegeId]);
        if (collegeRes.rows.length === 0) return res.status(404).json({ answer: "College not found." });
        const college = collegeRes.rows[0];
        
        const docsRes = await pool.query('SELECT title, content FROM knowledge_documents WHERE college_id = $1', [collegeId]);
        const documents = docsRes.rows;
        const knowledgeBase = documents.map(doc => `Title: ${doc.title}\nContent:\n${doc.content}`).join('\n\n---\n\n');

        // --- Step 2: FINAL, UNIFIED System Instruction ---
        const systemInstruction = `You are CampusBot, an expert AI assistant for ${college.name}.

        **Your Core Task:** Act as a helpful, friendly, and slightly witty assistant to students.
        
        **CRITICAL RULE: Language and Translation**
        - You MUST automatically detect the user's language (e.g., English, Tamil, Tanglish).
        - To understand questions about the college, you MUST mentally translate the user's query to English to check it against the Knowledge Base. For example, if the user asks "hope pathi sollu", you must recognize its English intent is "Tell me about hope".
        - You MUST ALWAYS reply in the user's original language and conversational style.

        **ANSWERING LOGIC (Follow these steps in order):**
        1.  **Check Knowledge Base:** First, check if the user's query (after your internal translation) can be answered using the provided **Knowledge Base**. If it can, you MUST base your answer ONLY on that information.
        2.  **Use General Knowledge:** If the question is clearly NOT about the college (e.g., "what is the capital of India?"), answer it using your own general knowledge.
        3.  **Fallback:** If the question seems to be about the college, but you absolutely CANNOT find a relevant answer in the Knowledge Base, your ONLY response must be the single word: "FALLBACK".

        **Knowledge Base for ${college.name}:**
        ---
        ${knowledgeBase}
        ---
        `;

        // --- Step 3: Run the AI model ---
        const result = await model.generateContent(systemInstruction + "\n\nUser Question: " + question);
        const response = result.response;
        let aiText = response.text().trim();

        // --- Step 4: Handle Fallback ---
        if (aiText === "FALLBACK") {
            if (college.staff_contact_name && college.staff_contact_phone) {
                aiText = `I couldn't find a specific answer in my knowledge base. For more help, please contact ${college.staff_contact_name} at ${college.staff_contact_phone}.`;
            } else {
                aiText = "I'm sorry, I couldn't find an answer to your question, and there is no staff contact information available.";
            }
        }

        res.json({ answer: aiText });

    } catch (err) {
        console.error('Chat endpoint error:', err);
        res.status(500).json({ answer: "Sorry, the AI brain is a bit tired right now. Please try again." });
    }
});

// --- NEW: Function to start the server ---
async function startServer() {
    try {
        // Test the database connection
        const client = await pool.connect();
        console.log('Database connected successfully.');
        client.release();

        // Start the Express server
        app.listen(port, () => {
          console.log(`Server is running on http://localhost:${port}`);
        });

    } catch (err) {
        // If the database does not exist (Postgres error code 3D000), try to create it
        if (err && err.code === '3D000') {
            console.warn(`Database "${dbConfig.database}" does not exist. Attempting to create it...`);
            try {
                // Connect to the default 'postgres' database to create the target database
                const tmpConfig = Object.assign({}, dbConfig, { database: 'postgres' });
                const tmpPool = new Pool(tmpConfig);
                await tmpPool.query(`CREATE DATABASE ${dbConfig.database}`);
                await tmpPool.end();
                console.log(`Database "${dbConfig.database}" created successfully. Retrying connection...`);

                // Retry connecting with the original pool (the DB should now exist)
                const client = await pool.connect();
                client.release();
                console.log('Database connected successfully after creation.');

                app.listen(port, () => {
                  console.log(`Server is running on http://localhost:${port}`);
                });
                return;
            } catch (createErr) {
                console.error('Failed to create the database automatically. Server will not start.', createErr);
                process.exit(1);
            }
        }

        console.error('Failed to connect to the database. Server will not start.', err);
        process.exit(1); // Exit the process with an error code
    }
}

startServer();


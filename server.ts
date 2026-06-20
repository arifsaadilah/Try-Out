import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

// Body parser with size limits for base64 file payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Data directory path
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Data store files
const PATH_SETTINGS = path.join(DATA_DIR, 'settings.json');
const PATH_QUESTIONS = path.join(DATA_DIR, 'questions.json');
const PATH_RESULTS = path.join(DATA_DIR, 'results.json');

// Initialize data if not exist
if (!fs.existsSync(PATH_SETTINGS)) {
  fs.writeFileSync(PATH_SETTINGS, JSON.stringify({
    title: "Try Out UTBK SNBT - Mandiri",
    duration: 120,
    spreadsheetId: "1Zj5Tfl5C9ZQ2d1NXgVKl-tCXJrfxBnItIbVORUDZrW0",
    active: false
  }, null, 2));
}

if (!fs.existsSync(PATH_QUESTIONS)) {
  fs.writeFileSync(PATH_QUESTIONS, JSON.stringify([
    {
      id: "q1",
      number: 1,
      type: "PILIHAN_GANDA",
      question: "Manakah negara terkecil di Asia Tenggara secara geografis?",
      options: ["Indonesia", "Singapura", "Brunei Darussalam", "Timor Leste", "Malaysia"],
      correctAnswer: "B"
    },
    {
      id: "q2",
      number: 2,
      type: "ISIAN_SINGKAT",
      question: "Berapa hasil dari 15 dikalikan 4 lalu dikurangi 12?",
      correctAnswer: "48"
    },
    {
      id: "q3",
      number: 3,
      type: "PILIHAN_GANDA_KOMPLEKS",
      question: "Pilihlah semua bilangan prima yang bernilai kurang dari 10.",
      options: ["2", "3", "4", "5", "8", "9"],
      correctAnswer: "2,3,5"
    }
  ], null, 2));
}

if (!fs.existsSync(PATH_RESULTS)) {
  fs.writeFileSync(PATH_RESULTS, JSON.stringify([], null, 2));
}

// Helper functions for reading/writing files
const readJsonFile = (filePath: string) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return [];
  }
};

const writeJsonFile = (filePath: string, data: any) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
    return false;
  }
};

// --- API ENDPOINTS ---

// Admin & Setting endpoint
app.get('/api/settings', (req, res) => {
  const settings = readJsonFile(PATH_SETTINGS) as any;
  
  // Guarantee default Google Drive values exist in settings
  let updated = false;
  if (!settings.googleFolderId) {
    settings.googleFolderId = "1CuwQom3P7ZmiabBA08209B3OYzMGsuaD";
    updated = true;
  }
  if (settings.googleAccessToken === undefined) {
    settings.googleAccessToken = "";
    updated = true;
  }
  if (settings.googleClientId === undefined) {
    settings.googleClientId = "";
    updated = true;
  }
  
  if (updated) {
    writeJsonFile(PATH_SETTINGS, settings);
  }
  
  res.json(settings);
});

app.post('/api/settings', (req, res) => {
  const newSettings = req.body;
  writeJsonFile(PATH_SETTINGS, newSettings);
  res.json({ success: true, message: 'Settings updated successfully', settings: newSettings });
});

// Helper function to upload files directly to Google Drive via multipart REST API
async function uploadToGoogleDrive(
  fileName: string,
  mimeType: string,
  base64Data: string,
  folderId: string,
  accessToken: string
): Promise<{ id: string, name: string, webViewLink?: string, webContentLink?: string }> {
  if (!accessToken) {
    throw new Error('Google Drive Access Token is missing or invalid.');
  }

  // boundary for multipart/related request
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: fileName,
    mimeType: mimeType,
    parents: folderId ? [folderId] : undefined
  };

  const multipartRequestBody = Buffer.concat([
    Buffer.from(delimiter),
    Buffer.from('Content-Type: application/json; charset=UTF-8\r\n\r\n'),
    Buffer.from(JSON.stringify(metadata)),
    Buffer.from(delimiter),
    Buffer.from(`Content-Type: ${mimeType}\r\n`),
    Buffer.from('Content-Transfer-Encoding: base64\r\n\r\n'),
    Buffer.from(base64Data),
    Buffer.from(closeDelimiter)
  ]);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': multipartRequestBody.length.toString()
    },
    body: multipartRequestBody
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Google Drive Upload error details:', errText);
    throw new Error(`Google Drive API error: ${response.status} - ${errText}`);
  }

  return response.json() as any;
}

// Upload image to Google Drive folder
app.post('/api/google/upload-image', async (req, res) => {
  const { base64Image, fileName, mimeType } = req.body;
  if (!base64Image) {
    return res.status(400).json({ success: false, error: 'No image data provided' });
  }

  try {
    const settings = readJsonFile(PATH_SETTINGS) as any;
    if (!settings || !settings.googleAccessToken || !settings.googleFolderId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Penyimpanan Google Drive belum diaktifkan atau konfigurasi tidak lengkap di menu Pengaturan.' 
      });
    }

    const driveUpload = await uploadToGoogleDrive(
      fileName || `Image_Soal_${Date.now()}.png`,
      mimeType || 'image/png',
      base64Image,
      settings.googleFolderId,
      settings.googleAccessToken
    );

    // Translate to a direct viewable URL for standard html images
    const fileUrl = `https://drive.google.com/uc?export=view&id=${driveUpload.id}`;

    res.json({ 
      success: true, 
      fileUrl, 
      fileId: driveUpload.id, 
      webViewLink: driveUpload.webViewLink 
    });
  } catch (err: any) {
    console.error('Image upload to Google Drive error:', err);
    res.status(500).json({ success: false, error: err.message || 'Gagal mengunggah file ke Google Drive.' });
  }
});

// Questions Endpoints
app.get('/api/questions', (req, res) => {
  const questions = readJsonFile(PATH_QUESTIONS);
  res.json(questions);
});

app.post('/api/questions', (req, res) => {
  const questions = req.body;
  if (Array.isArray(questions)) {
    writeJsonFile(PATH_QUESTIONS, questions);
    return res.json({ success: true, message: 'Questions list updated', count: questions.length });
  }
  res.status(400).json({ success: false, error: 'Request body must be an array of questions' });
});

// Results Endpoints
app.get('/api/results', (req, res) => {
  const results = readJsonFile(PATH_RESULTS);
  res.json(results);
});

app.post('/api/submit', (req, res) => {
  const newResult = req.body;
  if (!newResult.name || !newResult.answers) {
    return res.status(400).json({ success: false, error: 'Missing name or answers' });
  }

  const results = readJsonFile(PATH_RESULTS);
  newResult.id = 'res_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  newResult.timestamp = new Date().toISOString();
  
  results.push(newResult);
  writeJsonFile(PATH_RESULTS, results);
  
  res.json({ success: true, message: 'Exam results submitted successfully', resultId: newResult.id });
});

// Parse PDF of Questions using Gemini API
app.post('/api/questions/import-pdf', async (req, res) => {
  const { base64File, fileName } = req.body;
  if (!base64File) {
    return res.status(400).json({ success: false, error: 'No PDF file data provided' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        success: false, 
        error: 'GEMINI_API_KEY is not defined. Please add it via Settings > Secrets panel.' 
      });
    }

    // Initialize Server-Side GoogleGenAI client (user-agent: aistudio-build)
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    // Content preparation for Gemini: PDF inlineData part + prompt
    const pdfPart = {
      inlineData: {
        mimeType: 'application/pdf',
        data: base64File
      }
    };

    const promptPart = {
      text: `Anda adalah asisten AI pembuat soal ujian profesional untuk UTBK SNBT Indonesia. 
Analisis file PDF soal tryout yang dilampirkan ini, dan kembalikan data soal interaktif yang berurutan dalam struktur JSON murni.

PENTING: Anda harus mengekstrak SEMUA soal dari PDF. Klasifikasikan tipe soal ke dalam salah satu dari 3 kategori berikut:
1. "PILIHAN_GANDA" - Memiliki persis 5 opsi (biasanya pilihan A, B, C, D, E) dengan tepat satu opsi kunci jawaban yang benar (misalnya "A", "B", "C", "D", "E").
2. "ISIAN_SINGKAT" - Jawaban singkat berupa angka atau frase kata yang spesifik (misalnya kunci jawaban berupa angka "24" atau teks ringkas).
3. "PILIHAN_GANDA_KOMPLEKS" - Soal yang membutuhkan pemilihan beberapa jawaban kritis yang benar, atau memuat pernyataan pilihan (benar/salah atau ya/tidak), atau memiliki beberapa checkbox pilihan. Format opsi berupa array pilihan, dan kunci jawaban dapat berupa daftar jawaban benar yang dipisahkan koma (misal: "A,C,D" atau teks kunci jawaban kompleks).

Format respon JSON murni yang dikembalikan harus berupa array objek yang mengikuti skema TypeScript berikut tanpa hiasan markdown extra atau teks pengantar lainnya (kembalikan hanya valid JSON array):
[
  {
    "number": 1,
    "type": "PILIHAN_GANDA" | "ISIAN_SINGKAT" | "PILIHAN_GANDA_KOMPLEKS",
    "question": "teks pertanyaan lengkap termasuk tabel atau stimulus soal jika ada (gunakan format markdown untuk baris baru atau tabel)",
    "options": ["Opsi A", "Opsi B", "Opsi C", "Opsi D", "Opsi E"], // hapus jika tipenya ISIAN_SINGKAT atau isi dengan pernyataan-pernyataan jika itu kompleks
    "correctAnswer": "Kunci jawaban berupa huruf (contoh: A), angka isian (contoh: 24), atau opsi kompleks (contoh: 'Benar,Benar,Salah' atau opsi yang benar dipisahkan koma)"
  }
]

Tolong tangani format stimulus teks bacaan panjang dengan rapi dalam bahasa Indonesia.`
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [pdfPart, promptPart],
    });

    const responseText = response.text || '';
    
    // Attempt to extract json from code block if returned with markdown wrapper
    let cleanJsonString = responseText.trim();
    if (cleanJsonString.startsWith('```json')) {
      cleanJsonString = cleanJsonString.substring(7);
    } else if (cleanJsonString.startsWith('```')) {
      cleanJsonString = cleanJsonString.substring(3);
    }
    if (cleanJsonString.endsWith('```')) {
      cleanJsonString = cleanJsonString.substring(0, cleanJsonString.length - 3);
    }
    cleanJsonString = cleanJsonString.trim();

    try {
      const questionsParsed = JSON.parse(cleanJsonString);
      
      // Inject unique IDs and guarantee number ordering
      const questionsWithIds = questionsParsed.map((q: any, idx: number) => ({
        id: 'q_' + Date.now() + '_' + idx,
        number: q.number || (idx + 1),
        type: q.type || 'PILIHAN_GANDA',
        question: q.question || '',
        options: q.options || (q.type === 'PILIHAN_GANDA' ? ['A', 'B', 'C', 'D', 'E'] : undefined),
        correctAnswer: String(q.correctAnswer || '')
      }));

      // Try uploading PDF to Google Drive if setup is correct
      let driveFileUrl = undefined;
      try {
        const settings = readJsonFile(PATH_SETTINGS) as any;
        if (settings && settings.googleAccessToken && settings.googleFolderId) {
          console.log('Uploading PDF to Google Drive...');
          const driveFile = await uploadToGoogleDrive(
            fileName || `Ujian_UTBK_${Date.now()}.pdf`,
            'application/pdf',
            base64File,
            settings.googleFolderId,
            settings.googleAccessToken
          );
          driveFileUrl = driveFile.webViewLink;
          console.log('PDF successfully uploaded. WebViewLink:', driveFileUrl);
        }
      } catch (driveErr: any) {
        console.error('Failed to automatically upload PDF to Google Drive:', driveErr.message);
      }

      res.json({ success: true, questions: questionsWithIds, driveFileUrl });
    } catch (jsonErr) {
      console.error('JSON parsing error of response:', jsonErr, 'Raw string:', cleanJsonString);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to format AI response as JSON. AI response was not valid JSON.',
        rawResponse: responseText 
      });
    }

  } catch (error: any) {
    console.error('Gemini API Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'An error occurred during PDF conversion with Gemini AI.' 
    });
  }
});

// Configure Vite integration for dev vs prod environments
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`UTBK SNBT App Server running on port ${PORT}`);
  });
}

startServer();

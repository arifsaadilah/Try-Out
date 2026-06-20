import React, { useState, useEffect } from 'react';
import { 
  Settings, FileUp, Table, Edit3, Trash2, Plus, Check, X, 
  Copy, RefreshCw, Eye, Play, Pause, AlertCircle, Upload, ListChecks, HelpCircle
} from 'lucide-react';
import { Question, TryoutSettings, ExamResult } from '../types';

interface AdminDashboardProps {
  onPreviewExam: () => void;
}

export default function AdminDashboard({ onPreviewExam }: AdminDashboardProps) {
  // Settings State
  const [settings, setSettings] = useState<TryoutSettings>({
    title: "Try Out UTBK SNBT - Mandiri",
    duration: 120,
    spreadsheetId: "1Zj5Tfl5C9ZQ2d1NXgVKl-tCXJrfxBnItIbVORUDZrW0",
    active: false
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Questions State
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [isSavingQuestions, setIsSavingQuestions] = useState(false);

  // PDF Conversion State
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isConvertingPdf, setIsConvertingPdf] = useState(false);
  const [pdfConversionError, setPdfConversionError] = useState<string | null>(null);
  const [uploadedPdfUrl, setUploadedPdfUrl] = useState<string | null>(null);

  // Results State
  const [results, setResults] = useState<ExamResult[]>([]);
  const [isLoadingResults, setIsLoadingResults] = useState(false);

  // Active Tab: 'settings' | 'questions' | 'results' | 'pdf'
  const [activeTab, setActiveTab] = useState<'settings' | 'questions' | 'results'>('questions');

  // Load configuration and questions on mount
  useEffect(() => {
    fetchSettings();
    fetchQuestions();
    fetchResults();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    }
  };

  const fetchQuestions = async () => {
    setIsLoadingQuestions(true);
    try {
      const res = await fetch('/api/questions');
      if (res.ok) {
        const data = await res.json();
        setQuestions(data.sort((a: Question, b: Question) => a.number - b.number));
      }
    } catch (err) {
      console.error("Failed to fetch questions:", err);
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  const fetchResults = async () => {
    setIsLoadingResults(true);
    try {
      const res = await fetch('/api/results');
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      }
    } catch (err) {
      console.error("Failed to fetch results:", err);
    } finally {
      setIsLoadingResults(false);
    }
  };

  const saveSettings = async (overrideSettings?: TryoutSettings) => {
    setIsSavingSettings(true);
    const targetSettings = overrideSettings || settings;
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetSettings)
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        alert("Penggaturan berhasil disimpan!");
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
      alert("Gagal menyimpan pengaturan.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const saveQuestionsList = async (listToSave: Question[]) => {
    setIsSavingQuestions(true);
    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(listToSave)
      });
      if (res.ok) {
        setQuestions(listToSave);
        return true;
      }
      return false;
    } catch (err) {
      console.error("Failed to save questions:", err);
      return false;
    } finally {
      setIsSavingQuestions(false);
    }
  };

  // PDF File Upload Handler
  const handlePdfUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfFile) return;

    setIsConvertingPdf(true);
    setPdfConversionError(null);

    const reader = new FileReader();
    reader.readAsDataURL(pdfFile);
    reader.onload = async () => {
      try {
        const base64Data = (reader.result as string).split(',')[1];
        const res = await fetch('/api/questions/import-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64File: base64Data,
            fileName: pdfFile.name
          })
        });

        const data = await res.json();
        if (data.success) {
          if (data.driveFileUrl) {
            setUploadedPdfUrl(data.driveFileUrl);
          } else {
            setUploadedPdfUrl(null);
          }
          // Merge or replace questions
          const confirmReplace = window.confirm(
            `AI Berhasil mendeteksi ${data.questions.length} soal dalam PDF.\nApakah Anda ingin menggantikan soal yang ada di draf dengan soal baru ini?`
          );
          if (confirmReplace) {
            const saved = await saveQuestionsList(data.questions);
            if (saved) {
              alert("Soal berhasil dikonversi dan disimpan ke sistem!");
              setPdfFile(null);
            } else {
              alert("Gagal menyimpan soal hasil konversi.");
            }
          }
        } else {
          setPdfConversionError(data.error || "Gagal mengonversi PDF.");
        }
      } catch (err: any) {
        console.error("PDF upload conversion failed:", err);
        setPdfConversionError(err.message || "Koneksi terputus saat mengunggah PDF.");
      } finally {
        setIsConvertingPdf(false);
      }
    };
  };

  // Google Sheet Sync Helpers
  const handleImportFromSheets = async () => {
    if (!settings.spreadsheetId) {
      alert("Silakan atur Spreadsheet ID terlebih dahulu di tab Pengaturan.");
      return;
    }

    const confirmImport = window.confirm(
      "Apakah Anda yakin ingin mengimpor data soal dari Google Sheets?\nIni akan membaca dari sheet 'Soal'."
    );
    if (!confirmImport) return;

    setIsLoadingQuestions(true);
    try {
      // Direct client-side fetch from the public sheet preview as CSV (it's 100% reliable)
      const url = `https://docs.google.com/spreadsheets/d/${settings.spreadsheetId}/gviz/tq?tqx=out:csv&sheet=Soal`;
      const res = await fetch(url);
      
      if (!res.ok) {
        throw new Error("Gagal mengambil data dari Google Sheets. Pastikan spreadsheet diatur publik (Dapat dilihat oleh siapa saja yang memiliki link).");
      }

      const csvText = await res.text();
      const parsedQuestions = parseCSVQuestions(csvText);

      if (parsedQuestions.length === 0) {
        throw new Error("Tidak ada soal yang ditemukan pada sheet 'Soal'. Pastikan nama sheet adalah 'Soal' dan format kolom sesuai.");
      }

      const saved = await saveQuestionsList(parsedQuestions);
      if (saved) {
        alert(`Berhasil mengimpor ${parsedQuestions.length} soal dari Google Sheet!`);
      } else {
        alert("Gagal men-synchronize soal ke penyimpanan lokal.");
      }

    } catch (err: any) {
      console.error(err);
      alert(err.message || "Terjadi kesalahan saat mengimpor.");
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  // CSV Parser to extract questions from Google Sheet
  const parseCSVQuestions = (csvText: string): Question[] => {
    const lines: string[] = [];
    let currentLine = "";
    let insideQuote = false;

    // Helper to carefully segment CSV rows ignoring commas inside quotes
    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      if (char === '"') {
        insideQuote = !insideQuote;
      }
      if (char === '\n' && !insideQuote) {
        lines.push(currentLine);
        currentLine = "";
      } else {
        currentLine += char;
      }
    }
    if (currentLine) lines.push(currentLine);

    const result: Question[] = [];
    if (lines.length <= 1) return []; // Only header or empty

    // Find layout headers or assume absolute indexing:
    // Columns: No | Tipe Soal | Pertanyaan | Pilihan | Kunci Jawaban | URL Gambar
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const cells: string[] = [];
      let currentCell = "";
      let cellInsideQuote = false;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          cellInsideQuote = !cellInsideQuote;
        } else if (char === ',' && !cellInsideQuote) {
          cells.push(currentCell.trim());
          currentCell = "";
        } else {
          currentCell += char;
        }
      }
      cells.push(currentCell.trim());

      if (cells.length < 3 || !cells[2]) continue; // Needs at least Pertanyaan

      const no = parseInt(cells[0]) || i;
      const rawType = cells[1]?.toUpperCase() || "";
      let type: 'PILIHAN_GANDA' | 'ISIAN_SINGKAT' | 'PILIHAN_GANDA_KOMPLEKS' = 'PILIHAN_GANDA';
      if (rawType.includes('SINGKAT') || rawType.includes('ISIAN')) type = 'ISIAN_SINGKAT';
      if (rawType.includes('KOMPLEKS') || rawType.includes('PILIHAN GANDA KOMPLEKS')) type = 'PILIHAN_GANDA_KOMPLEKS';

      const questionText = cells[2];
      const rawOptions = cells[3] || "";
      const correctAnswer = cells[4] || "";
      const imageUrl = cells[5] || "";

      // Parse options separated by ';'
      const options = rawOptions ? rawOptions.split(';').map(o => o.trim()).filter(Boolean) : undefined;

      result.push({
        id: `sheet_q_${Date.now()}_${i}`,
        number: no,
        type,
        question: questionText,
        options,
        correctAnswer,
        imageUrl: imageUrl || undefined
      });
    }

    return result;
  };

  // Format Helper to guide Google Sheet Schema
  const copySheetSchemaInstructions = () => {
    const text = `Sheet 1: "Soal" (Gunakan persis nama ini)
Kolom Header (Baris 1):
A1: No
B1: Tipe Soal
C1: Pertanyaan
D1: Pilihan Jawaban (Pisahkan tiap pilihan dengan tanda ;)
E1: Kunci Jawaban
F1: URL Gambar

Sheet 2: "Hasil TO" (Gunakan persis nama ini)
Kolom Header (Baris 1):
A1: Timestamp
B1: Nama Peserta
C1: Waktu Mulai
D1: Selesai Ujian
E1: Jawaban Benar
F1: Jawaban Salah
G1: Nilai Akhir
H1: Detail Jawaban`;

    navigator.clipboard.writeText(text);
    alert("Kerangka skema Google Sheet disalin ke clipboard! Silakan paste ke Spreadsheet Anda.");
  };

  // Local question updates
  const handleAddQuestion = () => {
    const newNumber = questions.length + 1;
    const newQ: Question = {
      id: 'q_new_' + Date.now(),
      number: newNumber,
      type: 'PILIHAN_GANDA',
      question: "Tulis pertanyaan baru Anda di sini...",
      options: ["Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D", "Pilihan E"],
      correctAnswer: "A"
    };

    const newList = [...questions, newQ];
    setQuestions(newList);
    setSelectedQuestion(newQ);
    saveQuestionsList(newList);
  };

  const handleDeleteQuestion = (id: string) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus soal ini?")) return;
    const newList = questions.filter(q => q.id !== id).map((q, idx) => ({
      ...q,
      number: idx + 1
    }));
    setQuestions(newList);
    if (selectedQuestion?.id === id) {
      setSelectedQuestion(newList[0] || null);
    }
    saveQuestionsList(newList);
  };

  const handleUpdateQuestion = (updated: Question) => {
    const newList = questions.map(q => q.id === updated.id ? updated : q);
    setQuestions(newList);
    setSelectedQuestion(updated);
    saveQuestionsList(newList);
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50 font-sans text-slate-950">
      {/* Sidebar Navigation (Professional Polish Theme) */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-b md:border-b-0 md:border-r border-slate-800">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between md:block shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white selection:bg-blue-300">U</div>
            <span className="text-xl font-bold tracking-tight text-white">UTBK Portal</span>
          </div>
          <div className="md:hidden flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${settings.active ? 'bg-emerald-500' : 'bg-slate-500'}`}></span>
            <span className="text-[10px] uppercase font-bold text-slate-400">
              {settings.active ? "Sesi Aktif" : "Sesi Tutup"}
            </span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <div className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">Management</div>
          
          <button
            onClick={() => setActiveTab('questions')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-bold transition-all ${
              activeTab === 'questions' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <ListChecks className="w-4 h-4 shrink-0" />
            <span>Try Out Builder ({questions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-bold transition-all ${
              activeTab === 'settings' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span>Aturan Ujian (Settings)</span>
          </button>

          <button
            onClick={() => setActiveTab('results')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-bold transition-all ${
              activeTab === 'results' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Table className="w-4 h-4 shrink-0" />
            <span>Hasil Ujian Peserta ({results.length})</span>
          </button>

          <div className="pt-4 px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">DATABASE</div>
          
          <div className="space-y-1 pt-1">
            <button
              onClick={handleImportFromSheets}
              disabled={isLoadingQuestions}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-white rounded-md transition duration-150 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isLoadingQuestions ? 'animate-spin' : ''}`} />
              <span>Impor Google Sheets</span>
            </button>

            <button
              onClick={copySheetSchemaInstructions}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-white rounded-md transition duration-150"
            >
              <Copy className="w-3.5 h-3.5 text-slate-500" />
              <span>Salin Skema DB Sheet</span>
            </button>
          </div>
        </nav>

        {/* Sync Info Footer Widget */}
        <div className="p-4 bg-slate-950/40 border-t border-slate-800 text-[11px] text-slate-400 shrink-0 space-y-1.5">
          <p className="truncate">Active Sheet ID: <span className="text-blue-400 font-mono">UTBK_SNBT_2024</span></p>
          <div className="flex items-center gap-2 mt-1">
            <div className={`w-1.5 h-1.5 rounded-full ${settings.active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`}></div>
            <span className="text-[10px] uppercase font-bold text-slate-500">
              {settings.active ? 'Database Online' : 'Database Offline'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Workspace Frame (Professional Polish Theme) */}
      <main className="flex-1 flex flex-col min-w-0">
        
        {/* Main Header Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 md:px-8 flex items-center justify-between shrink-0 sticky top-0 z-40 shadow-xs">
          <div className="flex items-center gap-3 text-xs md:text-sm font-medium text-slate-500 min-w-0">
            <span className="text-slate-400 hidden sm:inline uppercase font-bold text-[10px] tracking-wider">Preparation</span>
            <svg className="w-3.5 h-3.5 text-slate-400 hidden sm:inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-slate-900 font-bold truncate">{settings.title}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onPreviewExam}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-md hover:bg-slate-50 transition shadow-xs"
            >
              <Eye className="w-3.5 h-3.5 text-slate-400" />
              <span>Tinjau Ujian</span>
            </button>

            <button
              onClick={() => {
                const newSettings = { ...settings, active: !settings.active };
                setSettings(newSettings);
                saveSettings(newSettings);
              }}
              className={`flex items-center gap-2 px-4 py-2 text-white text-xs font-semibold rounded-md shadow-xs transition ${
                settings.active 
                  ? 'bg-rose-500 hover:bg-rose-600' 
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {settings.active ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Selesai / Tutup TO</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Buka Ujian / Launch TO</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Builder Content Container */}
        <div className="flex-1 p-6 md:p-8 space-y-6">
          
          {/* Content Pane */}
          <div className="w-full">

          {/* TAB: PREPARE QUESTIONS */}
          {activeTab === 'questions' && (
            <div className="space-y-6">
              
              {/* PDF Uploader Card */}
              <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                      <FileUp className="w-5 h-5 text-blue-600" />
                      <span>Konversi Soal PDF Melalui Gemini AI</span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">Unggah file PDF soal cetak agar otomatis dikonversi menjadi format interaktif terstruktur.</p>
                  </div>
                  <HelpCircle className="w-4 h-4 text-slate-400 cursor-pointer hover:text-slate-600" title="Gemini AI otomatis melakukan segmentasi pada teks pertanyaan, opsi jawaban A-E, dan mengenali kunci jawaban di dokumen PDF Anda." />
                </div>

                <form onSubmit={handlePdfUpload} className="mt-4 space-y-4">
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 hover:border-blue-500 hover:bg-blue-50/20 transition flex flex-col items-center justify-center space-y-2 relative">
                    <input 
                      type="file" 
                      accept="application/pdf"
                      onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Upload className="w-8 h-8 text-slate-300" />
                    <span className="text-sm font-semibold text-slate-700">
                      {pdfFile ? pdfFile.name : "Pilih atau Seret File PDF Soal"}
                    </span>
                    <span className="text-xs text-slate-400">Pastikan file PDF berisi stimulus bacaan dan pertanyaan</span>
                  </div>

                  {pdfFile && (
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isConvertingPdf}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg shadow-sm transition disabled:opacity-50 flex items-center space-x-2"
                      >
                        {isConvertingPdf ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Memproses PDF & Mengekstrak Soal...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            <span>Mulai Konversi AI</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {pdfConversionError && (
                    <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 text-xs rounded-lg flex items-center space-x-2">
                      <X className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{pdfConversionError}</span>
                    </div>
                  )}

                  {uploadedPdfUrl && (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-100 text-[11px] rounded-lg space-y-1.5 shadow-xs">
                      <div className="flex items-center space-x-2 font-bold text-emerald-800">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Dokumen PDF berhasil dicadangkan langsung ke Google Drive Folder!</span>
                      </div>
                      <div className="pl-6">
                        <a 
                          href={uploadedPdfUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-xs text-blue-600 hover:underline font-semibold flex items-center space-x-1"
                        >
                          <span>Buka File PDF di Google Drive ↗</span>
                        </a>
                      </div>
                    </div>
                  )}
                </form>
              </div>

              {/* Questions Area */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                
                {/* Questions List */}
                <div className="md:col-span-2 bg-white rounded-xl shadow-xs border border-slate-200 p-4 flex flex-col h-[550px]">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                    <h3 className="font-bold text-sm text-slate-900">Daftar Soal ({questions.length})</h3>
                    <button
                      onClick={handleAddQuestion}
                      className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-semibold flex items-center space-x-1 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah</span>
                    </button>
                  </div>

                  {isLoadingQuestions ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mb-2" />
                      <span className="text-xs">Memuat soal...</span>
                    </div>
                  ) : questions.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-450 border border-dashed border-slate-100 rounded-lg p-6">
                      <ListChecks className="w-8 h-8 text-slate-350 mb-2" />
                      <p className="text-xs font-semibold text-slate-400 text-center">Belum ada soal terdaftar</p>
                      <p className="text-[10px] text-slate-400 text-center mt-1">Impor dari Sheets atau upload PDF untuk memulai</p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                      {questions.map((q) => (
                        <div
                           key={q.id}
                           onClick={() => setSelectedQuestion(q)}
                           className={`group w-full text-left p-2.5 rounded-lg border text-xs cursor-pointer transition flex items-start justify-between ${
                             selectedQuestion?.id === q.id
                               ? 'border-blue-500 bg-blue-50/40 text-blue-900 font-semibold'
                               : 'border-slate-100 hover:border-slate-300 text-slate-650 hover:bg-slate-50'
                           }`}
                        >
                          <div className="flex-1 min-w-0 pr-2">
                            <span className="inline-block bg-slate-200 font-bold px-1.5 py-0.5 rounded mr-1.5 text-slate-800">
                              {q.number}
                            </span>
                            <span className="text-[10px] uppercase font-bold tracking-wider mr-2 text-blue-600 bg-blue-50 px-1 rounded">
                              {q.type.replace('_', ' ')}
                            </span>
                            <p className="mt-1 text-slate-800 line-clamp-2 leading-relaxed">
                              {q.question.replace(/<[^>]*>/g, '')}
                            </p>
                          </div>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteQuestion(q.id);
                            }}
                            className="text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 p-1 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Editor Box */}
                <div className="md:col-span-3 bg-white rounded-xl shadow-xs border border-slate-200 p-5 flex flex-col h-[550px]">
                  {selectedQuestion ? (
                    <div className="flex-1 flex flex-col h-full overflow-y-auto pr-1">
                      <div className="flex items-center justify-between pb-3 border-b border-blue-150 mb-4">
                        <span className="text-sm font-bold text-slate-900">
                          Edit Soal Nomor {selectedQuestion.number}
                        </span>
                        <div className="flex items-center space-x-1 text-xs">
                          <span className="text-slate-400">Tipe:</span>
                          <select
                            value={selectedQuestion.type}
                            onChange={(e) => {
                              const type = e.target.value as any;
                              let newCorrectAnswer = selectedQuestion.correctAnswer;
                              let newOptions = selectedQuestion.options;
                              if (type === 'PILIHAN_GANDA' && !newOptions) {
                                newOptions = ["A", "B", "C", "D", "E"];
                                newCorrectAnswer = "A";
                              } else if (type === 'ISIAN_SINGKAT') {
                                newOptions = undefined;
                                newCorrectAnswer = "";
                              }
                              handleUpdateQuestion({
                                ...selectedQuestion,
                                type,
                                options: newOptions,
                                correctAnswer: newCorrectAnswer
                              });
                            }}
                            className="bg-slate-100 hover:bg-slate-150 border-0 rounded font-semibold text-blue-700 px-2 py-1 cursor-pointer outline-none"
                          >
                            <option value="PILIHAN_GANDA">Pilihan Ganda</option>
                            <option value="ISIAN_SINGKAT">Isian Singkat</option>
                            <option value="PILIHAN_GANDA_KOMPLEKS">Kompleks</option>
                          </select>
                        </div>
                      </div>

                      {/* Question form field */}
                      <div className="space-y-4 flex-1">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-500 uppercase">Pertanyaan (Mendukung Teks biasa / Markdown)</label>
                          <textarea
                            value={selectedQuestion.question}
                            onChange={(e) => handleUpdateQuestion({ ...selectedQuestion, question: e.target.value })}
                            className="w-full min-h-[100px] p-2.5 text-xs border border-slate-200 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                            placeholder="Tulis pertanyaan disini..."
                          />
                        </div>

                        {/* Image URL / Upload Optional field */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-500 uppercase">Gambar Pendukung (Opsional)</label>
                            {settings.googleAccessToken && (
                              <span className="text-[10px] text-emerald-600 font-bold flex items-center space-x-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                                <span>Terhubung Google Drive</span>
                              </span>
                            )}
                          </div>
                          
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={selectedQuestion.imageUrl || ''}
                              onChange={(e) => handleUpdateQuestion({ ...selectedQuestion, imageUrl: e.target.value || undefined })}
                              className="w-full p-2 text-xs border border-slate-200 bg-white rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800"
                              placeholder="Masukkan link/URL gambar (misal: https://...)"
                            />
                            
                            <div className="flex items-center space-x-2">
                              <div className="relative flex-1">
                                <input
                                  type="file"
                                  accept="image/*"
                                  id="question-image-upload"
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    
                                    try {
                                      const reader = new FileReader();
                                      reader.readAsDataURL(file);
                                      reader.onloadend = async () => {
                                        const base64Data = (reader.result as string).split(',')[1];
                                        
                                        // Request to upload image
                                        const uploadRes = await fetch('/api/google/upload-image', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            base64Image: base64Data,
                                            fileName: file.name,
                                            mimeType: file.type
                                          })
                                        });
                                        
                                        const uploadData = await uploadRes.json();
                                        if (uploadData.success && uploadData.fileUrl) {
                                          handleUpdateQuestion({
                                            ...selectedQuestion,
                                            imageUrl: uploadData.fileUrl
                                          });
                                          alert("Gambar berhasil diunggah ke Google Drive dan ditautkan ke soal!");
                                        } else {
                                          alert("Gagal mengunggah gambar ke Google Drive: " + (uploadData.error || "Pastikan token Google Drive aktif di menu Pengaturan."));
                                        }
                                      };
                                    } catch (err: any) {
                                      alert("Gagal memproses file gambar: " + err.message);
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  className="w-full p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 flex items-center justify-center space-x-1.5 transition"
                                >
                                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                                  <span>Unggah Gambar ke Drive</span>
                                </button>
                              </div>
                              {selectedQuestion.imageUrl && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQuestion({ ...selectedQuestion, imageUrl: undefined })}
                                  className="p-2 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-lg text-xs transition"
                                  title="Hapus gambar"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                            
                            {selectedQuestion.imageUrl && (
                              <div className="mt-2 border border-slate-100 rounded-lg p-2 bg-slate-50 flex flex-col items-center justify-center space-y-1">
                                <span className="text-[10px] text-slate-400 font-mono break-all truncate max-w-xs">{selectedQuestion.imageUrl}</span>
                                <img
                                  src={selectedQuestion.imageUrl}
                                  alt="Preview"
                                  className="max-h-24 max-w-full rounded object-contain border border-slate-200 bg-white"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Conditional Options Fields */}
                        {selectedQuestion.type === 'PILIHAN_GANDA' && (
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Opsi Pilihan Ganda & Kunci Utama</label>
                            <div className="space-y-2.5">
                              {(selectedQuestion.options || ['A', 'B', 'C', 'D', 'E']).map((opt, idx) => {
                                const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
                                const label = letters[idx] || letters[0];
                                return (
                                  <div key={idx} className="flex items-center space-x-2">
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateQuestion({ ...selectedQuestion, correctAnswer: label })}
                                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border transition shrink-0 ${
                                        selectedQuestion.correctAnswer === label
                                          ? 'bg-emerald-600 border-emerald-600 text-white'
                                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'
                                      }`}
                                    >
                                      {label}
                                    </button>
                                    <input
                                      type="text"
                                      value={opt}
                                      onChange={(e) => {
                                        const nextOptions = [...(selectedQuestion.options || [])];
                                        nextOptions[idx] = e.target.value;
                                        handleUpdateQuestion({ ...selectedQuestion, options: nextOptions });
                                      }}
                                      className="flex-1 p-2 text-xs border border-slate-200 rounded-lg focus:border-indigo-500 outline-none"
                                      placeholder={`Masukan teks opsi pilihan ${label}`}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {selectedQuestion.type === 'ISIAN_SINGKAT' && (
                          <div className="space-y-1 bg-indigo-50/50 p-3 rounded-lg border border-indigo-100/50">
                            <label className="text-xs font-bold text-indigo-900 uppercase">Kunci Jawaban Isian Singkat</label>
                            <p className="text-[10px] text-slate-400 mb-2">Siswa harus menginput nilai yang tepat sama dengan isian ini (case-insensitive).</p>
                            <input
                              type="text"
                              value={selectedQuestion.correctAnswer}
                              onChange={(e) => handleUpdateQuestion({ ...selectedQuestion, correctAnswer: e.target.value })}
                              className="w-full p-2.5 text-xs border border-slate-300 rounded-lg bg-white focus:border-indigo-500 outline-none"
                              placeholder="Masukkan kata kunci/angka jawaban yang tepat"
                            />
                          </div>
                        )}

                        {selectedQuestion.type === 'PILIHAN_GANDA_KOMPLEKS' && (
                          <div className="space-y-3 bg-fuchsia-50/40 p-4 rounded-xl border border-fuchsia-100">
                            <div>
                              <label className="text-xs font-bold text-fuchsia-900 uppercase">Tipe Pilihan Ganda Kompleks</label>
                              <p className="text-[10px] text-slate-400 mt-0.5">Dapat digunakan untuk checklist pernyataan multipel (benar/salah) atau checkbox multi-jawaban.</p>
                            </div>

                            <div className="space-y-2">
                              <label className="text-xs font-bold text-slate-500">Pernyataan / Pilihan yang harus dievaluasi:</label>
                              
                              {/* Sub questions options lines */}
                              {selectedQuestion.options && selectedQuestion.options.map((opt, idx) => (
                                <div key={idx} className="flex items-center space-x-2">
                                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                    Item {idx+1}
                                  </span>
                                  <input
                                    type="text"
                                    value={opt}
                                    onChange={(e) => {
                                      const nextOpts = [...(selectedQuestion.options || [])];
                                      nextOpts[idx] = e.target.value;
                                      handleUpdateQuestion({ ...selectedQuestion, options: nextOpts });
                                    }}
                                    className="flex-1 p-2 text-xs border border-slate-200 rounded-lg bg-white outline-none"
                                    placeholder="Isi pernyataan atau Opsi checkbox"
                                  />
                                  <button
                                    onClick={() => {
                                      const nextOpts = (selectedQuestion.options || []).filter((_, i) => i !== idx);
                                      handleUpdateQuestion({ ...selectedQuestion, options: nextOpts });
                                    }}
                                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}

                              <button
                                onClick={() => {
                                  const nextOpts = [...(selectedQuestion.options || []), "Pernyataan Baru"];
                                  handleUpdateQuestion({ ...selectedQuestion, options: nextOpts });
                                }}
                                className="w-full py-1.5 border border-dashed border-slate-200 hover:border-slate-400 text-[10px] font-bold text-slate-500 text-center rounded-lg cursor-pointer"
                              >
                                + Tambah Pernyataan/Pilihan
                              </button>
                            </div>

                            <div className="space-y-1">
                              <label className="text-xs font-bold text-slate-600">Jawaban Benar / Pola Kunci:</label>
                              <input
                                type="text"
                                value={selectedQuestion.correctAnswer}
                                onChange={(e) => handleUpdateQuestion({ ...selectedQuestion, correctAnswer: e.target.value })}
                                className="w-full p-2 text-xs border border-slate-300 rounded-lg bg-white outline-none"
                                placeholder="Contoh: Benar,Benar,Salah ATAU opsi huruf dipisahkan koma seperti A,C"
                              />
                              <span className="text-[9px] text-fuchsia-800">Teks ini dicocokkan dengan jawaban peserta yang divalidasi oleh sistem.</span>
                            </div>
                          </div>
                        )}

                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                      <Edit3 className="w-8 h-8 text-slate-200 mb-2" />
                      <span className="text-xs">Pilih salah satu soal untuk diedit, atau tambah soal baru</span>
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* TAB: PREPARE SETTINGS */}
          {activeTab === 'settings' && (
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6 space-y-6">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                  <Settings className="w-5 h-5 text-blue-600" />
                  <span>Pengaturan Try Out UTBK SNBT</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Konfigurasikan judul ujian, batasan waktu, dan sinkronisasi basis data spreadsheet.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-100">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 uppercase">Judul Try Out</label>
                    <input
                      type="text"
                      value={settings.title}
                      onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                      className="w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:border-blue-500 outline-none"
                      placeholder="Masukkan nama Try Out UTBK"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 uppercase">Durasi Pengerjaan (Menit)</label>
                    <input
                      type="number"
                      value={settings.duration}
                      onChange={(e) => setSettings({ ...settings, duration: parseInt(e.target.value) || 0 })}
                      className="w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:border-blue-500 outline-none"
                      placeholder="Contoh: 120"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 uppercase">Google Spreadsheet ID</label>
                    <input
                      type="text"
                      value={settings.spreadsheetId}
                      onChange={(e) => setSettings({ ...settings, spreadsheetId: e.target.value })}
                      className="w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:border-blue-500 outline-none"
                      placeholder="Masukan Google Spreadsheet ID"
                    />
                    <div className="bg-slate-50 p-2.5 rounded-lg text-[10px] text-slate-500 leading-relaxed mt-1">
                      Spreadsheet ID adalah string panjang di dalam URL. Contoh: <br />
                      <span className="font-mono text-[9px] bg-white px-1 py-0.5 border border-slate-100 text-slate-700">1Zj5Tfl5C9ZQ2d1NXgVKl-tCXJrfxBnItIbVORUDZrW0</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* GOOGLE DRIVE STORAGE SECTION */}
              <div className="pt-6 border-t border-slate-100 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                    <span className="p-1 px-1.5 bg-blue-100 rounded text-blue-700 text-xs font-black">DRIVE</span>
                    <span>Penyimpanan Google Drive Otomatis (PDF & Gambar)</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Hubungkan akun Google Drive Anda agar dokumen PDF soal dan file gambar yang diunggah disimpan otomatis langsung di folder Drive yang ditunjuk.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 uppercase flex items-center justify-between">
                      <span>Google Drive Folder ID</span>
                      <a 
                        href="https://drive.google.com/drive/folders/1CuwQom3P7ZmiabBA08209B3OYzMGsuaD" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-[10px] text-blue-600 hover:underline inline-flex items-center font-bold"
                      >
                        Buka Folder Drive ↗
                      </a>
                    </label>
                    <input
                      type="text"
                      value={settings.googleFolderId || ''}
                      onChange={(e) => setSettings({ ...settings, googleFolderId: e.target.value })}
                      className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-800"
                      placeholder="Masukkan ID Folder Google Drive"
                    />
                    <span className="text-[10px] text-slate-400 block font-medium">ID folder target (Default telah diset ke folder request Anda!)</span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 uppercase flex items-center justify-between">
                      <span>Google Auth Access Token</span>
                      <span className="text-[10px] text-slate-400 font-semibold">Token Sementara (Valid 1 Jam)</span>
                    </label>
                    <input
                      type="password"
                      value={settings.googleAccessToken || ''}
                      onChange={(e) => setSettings({ ...settings, googleAccessToken: e.target.value })}
                      className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-800"
                      placeholder="Masukkan Google OAuth Access Token"
                    />
                    <span className="text-[10px] text-slate-400 block font-medium">Token aman untuk melakukan operasi Google Drive API.</span>
                  </div>
                </div>

                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 text-xs text-blue-900 space-y-2 leading-relaxed font-normal">
                  <p className="font-bold text-blue-950 flex items-center space-x-1">
                    <span>💡</span>
                    <span>Bagaimana Cara Mendapatkan Google Auth Access Token Anda?</span>
                  </p>
                  <ol className="list-decimal pl-4 space-y-1 text-blue-800">
                    <li>Kunjungi <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener noreferrer" className="font-bold text-blue-700 underline hover:text-blue-950">Google OAuth 2.0 Playground</a>.</li>
                    <li>Di panel sebelah kiri pada search box (Step 1), masukkan scope: <code className="font-mono bg-white px-1.5 py-0.5 border border-blue-200 rounded text-[10px] font-bold text-indigo-700">https://www.googleapis.com/auth/drive.file</code> lalu klik tombol <strong>Authorize APIs</strong>.</li>
                    <li>Selesaikan verifikasi persetujuan di pop-up box menggunakan akun Google Anda yang memiliki hak akses.</li>
                    <li>Setelah kembali, klik tombol biru <strong>Exchange authorization code for tokens</strong> di Step 2.</li>
                    <li>Salin nilai string yang berada di kolom <strong>Access Token</strong>, lalu tempelkan di input di atas dan klik <strong>Simpan Pengaturan</strong> di bawah ini.</li>
                  </ol>
                  <p className="text-[11px] text-blue-700 italic border-t border-blue-100 pt-2 mt-2 font-medium">
                    Catatan: Google Playground Token memiliki durasi aktif selama 1 jam. Setiap kali Anda ingin melakukan import PDF dalam jumlah banyak / mengunggah gambar baru, silakan copy paste token baru yang dibuat dari Playground demi menjaga keamanan sistem dan fleksibilitas tanpa perlu konfigurasi backend server yang kompleks!
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => saveSettings()}
                  disabled={isSavingSettings}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg shadow-sm transition disabled:opacity-50 flex items-center space-x-2"
                >
                  {isSavingSettings ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Simpan Pengaturan</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB: VIEW PARTICIPANTS RESULTS */}
          {activeTab === 'results' && (
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                    <Table className="w-5 h-5 text-blue-600" />
                    <span>Data Hasil Ujian Peserta</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">Pantau nilai skor, durasi pengerjaan, dan butir jawaban benar salah peserta TO Anda.</p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={fetchResults}
                    className="p-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-xs font-semibold flex items-center space-x-1 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Segarkan</span>
                  </button>
                </div>
              </div>

              {isLoadingResults ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                  <RefreshCw className="w-8 h-8 animate-spin mb-2" />
                  <span className="text-xs">Memuat hasil TO peserta...</span>
                </div>
              ) : results.length === 0 ? (
                <div className="py-12 border border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-450 text-center p-6 bg-slate-50/30">
                  <Table className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="text-sm font-bold text-slate-700">Belum ada peserta yang mengumpulkan</p>
                  <p className="text-xs text-slate-500 max-w-sm mt-1">Aktifkan status TO dan bagikan link peserta agar mereka dapat mengisi.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold">
                        <th className="p-3">Nama</th>
                        <th className="p-3">Mulai</th>
                        <th className="p-3">Selesai</th>
                        <th className="p-3 text-center">Soal</th>
                        <th className="p-3 text-center">Benar</th>
                        <th className="p-3 text-center">Salah</th>
                        <th className="p-3 text-center">Skor Akhir</th>
                        <th className="p-3">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {results.map((res: ExamResult) => {
                        const start = new Date(res.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                        const end = new Date(res.endTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                        return (
                          <tr key={res.id} className="hover:bg-slate-50/50">
                            <td className="p-3 font-semibold text-slate-900">{res.name}</td>
                            <td className="p-3 text-slate-500">{start}</td>
                            <td className="p-3 text-slate-500">{end}</td>
                            <td className="p-3 text-center font-semibold">{res.totalQuestions}</td>
                            <td className="p-3 text-center font-bold text-emerald-600">{res.correctCount}</td>
                            <td className="p-3 text-center font-bold text-rose-600">{res.wrongCount}</td>
                            <td className="p-3 text-center">
                              <span className="inline-block bg-blue-50 text-blue-700 font-extrabold px-2 py-0.5 rounded text-xs">
                                {res.score.toFixed(1)}
                              </span>
                            </td>
                            <td className="p-3 max-w-[200px] truncate text-slate-400" title={JSON.stringify(res.answers)}>
                              {Object.keys(res.answers).length} soal terjawab
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </main>
  </div>
  );
}

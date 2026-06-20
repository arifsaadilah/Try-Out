import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Clock, HelpCircle, ChevronLeft, ChevronRight, 
  CheckCircle2, User, Award, AlertTriangle, BookOpen, KeyRound
} from 'lucide-react';
import { Question, TryoutSettings, ExamResult } from '../types';

interface ParticipantExamProps {
  onBackToAdmin: () => void;
}

export default function ParticipantExam({ onBackToAdmin }: ParticipantExamProps) {
  // Try Out Settings & Questions Loader
  const [settings, setSettings] = useState<TryoutSettings | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Participant Flow States: 'welcome' | 'instructions' | 'active_exam' | 'submitted'
  const [flow, setFlow] = useState<'welcome' | 'instructions' | 'active_exam' | 'submitted'>('welcome');
  
  // Participant Identity Info
  const [participantName, setParticipantName] = useState("");
  const [participantId, setParticipantId] = useState("");

  // Exam Active States
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [doubtful, setDoubtful] = useState<Record<string, boolean>>({}); // "Ragu-ragu" status
  const [timeLeft, setTimeLeft] = useState(0); // in seconds
  const [startTime, setStartTime] = useState<string>("");
  const [submitResult, setSubmitResult] = useState<ExamResult | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Load configuration and active questions
  useEffect(() => {
    const loadExamData = async () => {
      setIsLoading(true);
      try {
        const settingsRes = await fetch('/api/settings');
        const questionsRes = await fetch('/api/questions');
        
        if (settingsRes.ok && questionsRes.ok) {
          const sData = await settingsRes.json();
          const qData = await questionsRes.json();
          
          setSettings(sData);
          setQuestions(qData.sort((a: Question, b: Question) => a.number - b.number));
          setTimeLeft(sData.duration * 60);
        }
      } catch (err) {
        console.error("Failed to load exam details:", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadExamData();
  }, []);

  // Timer countdown hook
  useEffect(() => {
    if (flow === 'active_exam' && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            handleAutoSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [flow, timeLeft]);

  const handleStartExam = () => {
    if (!participantName.trim()) {
      alert("Silakan masukkan Nama Lengkap Anda terlebih dahulu.");
      return;
    }
    setStartTime(new Date().toISOString());
    setFlow('instructions');
  };

  const handleBeginAnswering = () => {
    setFlow('active_exam');
  };

  // Safe timer display helper
  const getFormattedTime = () => {
    const m = Math.floor(timeLeft / 60);
    const s = timeLeft % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentQuestion = questions[currentQuestionIndex];

  // Save current answer
  const handleSelectAnswer = (ans: string) => {
    if (!currentQuestion) return;
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: ans
    }));
  };

  // Toggle "Ragu-Ragu" checkbox item
  const handleToggleDoubtful = () => {
    if (!currentQuestion) return;
    setDoubtful(prev => ({
      ...prev,
      [currentQuestion.id]: !prev[currentQuestion.id]
    }));
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  // Grade the tryout locally and push statistics
  const gradeTryout = (): Omit<ExamResult, 'id' | 'timestamp'> => {
    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;
    const gradedDetails: Record<string, boolean> = {};

    questions.forEach(q => {
      const studentAnswer = (answers[q.id] || "").trim().toLowerCase();
      const correctAnswer = q.correctAnswer.trim().toLowerCase();

      if (!studentAnswer) {
        skippedCount++;
        gradedDetails[q.id] = false;
      } else {
        // Evaluate based on type
        let isCorrect = false;
        if (q.type === 'PILIHAN_GANDA') {
          isCorrect = studentAnswer === correctAnswer;
        } else if (q.type === 'ISIAN_SINGKAT') {
          // Compare strings directly
          isCorrect = studentAnswer === correctAnswer;
        } else if (q.type === 'PILIHAN_GANDA_KOMPLEKS') {
          // Handle complex matching by separating options or looking for substring match
          // If the admin wrote choices like "A,C" and students checked both, they matches
          isCorrect = studentAnswer === correctAnswer;
        }

        if (isCorrect) {
          correctCount++;
          gradedDetails[q.id] = true;
        } else {
          wrongCount++;
          gradedDetails[q.id] = false;
        }
      }
    });

    const score = questions.length > 0 ? (correctCount / questions.length) * 100 : 0;

    return {
      name: participantName,
      startTime,
      endTime: new Date().toISOString(),
      score,
      totalQuestions: questions.length,
      correctCount,
      wrongCount,
      skippedCount,
      answers,
      gradedDetails
    };
  };

  const submitResultsToBackend = async (gradedResult: any) => {
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gradedResult)
      });
      if (res.ok) {
        const data = await res.json();
        setSubmitResult({ ...gradedResult, id: data.resultId });
        setFlow('submitted');
      } else {
        alert("Gagal mengirim hasil ujian ke server. Silakan dicoba lagi.");
      }
    } catch (err) {
      console.error("Submission failed:", err);
      alert("Error saat mengirimkan jawaban. Pastikan koneksi internet aktif.");
    }
  };

  const handleAutoSubmit = () => {
    alert("WAKTU ANDA TELAH HABIS!\nJawaban Anda akan dikirimkan otomatis sekarang.");
    const finalGradedResult = gradeTryout();
    submitResultsToBackend(finalGradedResult);
  };

  const handleUserSubmit = () => {
    const unansweredCount = questions.length - Object.keys(answers).length;
    let confirmPrompt = "Apakah Anda yakin ingin menyelesaikan ujian sekarang?";
    if (unansweredCount > 0) {
      confirmPrompt = `Peringatan: Masih ada ${unansweredCount} soal yang belum dijawab.\nApakah Anda yakin tetap ingin mengumpulkan?`;
    }

    if (window.confirm(confirmPrompt)) {
      const finalGradedResult = gradeTryout();
      submitResultsToBackend(finalGradedResult);
    }
  };

  // Loading Screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
        <Clock className="w-10 h-10 animate-spin text-blue-600 mb-2" />
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Memuat lembar ujian...</p>
      </div>
    );
  }

  // Welcome / Identity Entrance View
  if (flow === 'welcome') {
    return (
      <div className="min-h-screen bg-gradient-to-tr from-slate-50 to-blue-50/40 flex flex-col justify-between font-sans p-6">
        
        {/* Header Branding */}
        <header className="max-w-4xl w-full mx-auto flex justify-between items-center py-4">
          <div className="flex items-center space-x-2.5">
            <span className="px-2.5 py-1.5 bg-blue-600 rounded text-white font-black text-xs tracking-widest">UTBK</span>
            <span className="text-base font-bold text-slate-900 tracking-tight">Try Out SNBT</span>
          </div>
          <button 
            onClick={onBackToAdmin}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-white border border-slate-250 px-4 py-2 rounded-lg transition shadow-xs"
          >
            Masuk Mode Admin
          </button>
        </header>

        {/* Form Identity Card */}
        <div className="max-w-md w-full mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-8 my-auto space-y-6">
          <div className="space-y-2 text-center">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">{settings?.title || "Try Out UTBK SNBT"}</h2>
            <p className="text-xs text-slate-500">Silakan melengkapi data otentik diri Anda untuk memulai ujian interaktif</p>
          </div>

          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-650 uppercase flex items-center space-x-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>Nama Lengkap</span>
              </label>
              <input
                type="text"
                value={participantName}
                onChange={(e) => setParticipantName(e.target.value)}
                placeholder="cth. Arif Saadilah"
                className="w-full p-3 text-sm border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition bg-slate-50/50"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-650 uppercase flex items-center space-x-1.5">
                <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                <span>Nomor Peserta / NISN (Opsional)</span>
              </label>
              <input
                type="text"
                value={participantId}
                onChange={(e) => setParticipantId(e.target.value)}
                placeholder="cth. 012345678"
                className="w-full p-3 text-sm border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition bg-slate-50/50"
              />
            </div>

            <button
              onClick={handleStartExam}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-xs transition"
            >
              Lanjutkan Ke Petunjuk
            </button>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center py-4 text-xs text-slate-400">
          Try Out SNBT Mandiri &copy; 2026. Semua Hak Cipta Dilindungi.
        </footer>
      </div>
    );
  }

  // Guidelines Instructions Screen
  if (flow === 'instructions') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans p-6">
        <div className="max-w-2xl w-full mx-auto bg-white rounded-2xl shadow-xs border border-slate-200 p-8 my-auto space-y-6">
          <div className="flex items-center space-x-3.5 pb-4 border-b border-slate-100">
            <BookOpen className="w-6 h-6 text-blue-600 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight font-sans">Petunjuk Pelaksanaan Try Out</h2>
              <p className="text-xs text-slate-500">Materi Uji: UTBK SNBT - {settings?.title}</p>
            </div>
          </div>

          <div className="space-y-3.5 text-xs text-slate-600 leading-relaxed">
            <p className="font-bold text-slate-800">Harap baca dengan teliti sebelum memulai ujian Anda:</p>
            <div className="flex items-start space-x-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-100 font-bold flex items-center justify-center shrink-0 text-slate-700">1</span>
              <span>Ujian ini dibatasi waktu secara ketat selama <strong className="text-slate-800">{settings?.duration} menit</strong>. Waktu ujian akan berjalan terus begitu Anda masuk ke modul soal.</span>
            </div>
            <div className="flex items-start space-x-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-100 font-bold flex items-center justify-center shrink-0 text-slate-700">2</span>
              <span>Soal terdiri dari 3 macam tipe: **Pilihan Ganda**, **Isian Singkat**, dan **Pilihan Ganda Kompleks** (pernyataan berseri / multifitur).</span>
            </div>
            <div className="flex items-start space-x-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-100 font-bold flex items-center justify-center shrink-0 text-slate-700">3</span>
              <span>Saat pengerjaan, Anda dapat menandai soal dengan tombol **Ragu-Ragu** agar mempermudah evaluasi ulang.</span>
            </div>
            <div className="flex items-start space-x-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-100 font-bold flex items-center justify-center shrink-0 text-slate-700">4</span>
              <span>Bila waktu habis, sistem akan menutup lembar jawaban Anda secara otomatis dan segera menyinkronkan hasilnya.</span>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-150 rounded-xl p-4 text-xs text-amber-900 flex items-start space-x-2.5 leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>Pemberitahuan: Jangan me-refresh / menutup browser saat ujian berlangsung agar tidak kehilangan data pengerjaan interaktif Anda.</span>
          </div>

          <div className="flex space-x-3 pt-4 border-t border-slate-100">
            <button
              onClick={() => setFlow('welcome')}
              className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 font-bold text-xs rounded-xl transition text-slate-600"
            >
              Kembali
            </button>
            <button
              onClick={handleBeginAnswering}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
            >
              Mulai Mengerjakan Sekarang
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Submitted Score view
  if (flow === 'submitted' && submitResult) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans p-6">
        <div className="max-w-md w-full mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-8 my-auto space-y-6 text-center">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto animate-bounce">
            <Award className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Ujian Telah Selesai!</h2>
            <p className="text-xs text-slate-500">Terima kasih telah berpartisipasi, {submitResult.name}. Data Anda telah disinkronisasi.</p>
          </div>

          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col items-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Skor Ujian Anda</span>
            <span className="text-5xl font-black text-blue-600 mt-2">{submitResult.score.toFixed(1)}</span>
            <div className="grid grid-cols-3 gap-4 w-full mt-6 pt-4 border-t border-slate-200 text-xs">
              <div className="text-center">
                <span className="text-slate-450 font-bold uppercase text-[9px] tracking-wider">Benar</span>
                <p className="text-emerald-600 font-extrabold mt-1 text-base">{submitResult.correctCount}</p>
              </div>
              <div className="text-center">
                <span className="text-slate-450 font-bold uppercase text-[9px] tracking-wider">Salah</span>
                <p className="text-rose-600 font-extrabold mt-1 text-base">{submitResult.wrongCount}</p>
              </div>
              <div className="text-center">
                <span className="text-slate-450 font-bold uppercase text-[9px] tracking-wider">Kosong</span>
                <p className="text-slate-500 font-extrabold mt-1 text-base">{submitResult.skippedCount}</p>
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              setAnswers({});
              setDoubtful({});
              setCurrentQuestionIndex(0);
              setFlow('welcome');
            }}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-xs transition"
          >
            Kembali ke Halaman Depan
          </button>
        </div>
      </div>
    );
  }

  // Active Interactive Exam Layout
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans select-none">
      
      {/* Top Banner Exam Information */}
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shadow-xs sticky top-0 z-40">
        <div className="flex items-center space-x-3">
          <span className="bg-blue-600 font-bold px-2 py-1 rounded text-[10px] tracking-widest uppercase">UTBK</span>
          <h1 className="text-sm font-bold truncate max-w-xs sm:max-w-md text-slate-50">{settings?.title || "Try Out UTBK SNBT"}</h1>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 bg-slate-850 px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-mono">
            <Clock className={`w-4 h-4 ${timeLeft < 300 ? 'text-rose-400 animate-pulse' : 'text-blue-400'}`} />
            <span className={`font-bold ${timeLeft < 300 ? 'text-rose-400' : 'text-slate-300'}`}>
              Sisa Waktu: {getFormattedTime()}
            </span>
          </div>

          <button
            onClick={handleUserSubmit}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition shadow-xs cursor-pointer"
          >
            Kumpulkan Ujian
          </button>
        </div>
      </header>

      {/* Main Content Areas splitter */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Stimulus and Question pane */}
        <div className="lg:col-span-3 flex flex-col space-y-4">
          {currentQuestion ? (
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6 flex-1 flex flex-col justify-between">
              
              <div className="space-y-4 flex-1">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs">
                  <span className="font-bold text-blue-700">SOAL NOMOR {currentQuestion.number}</span>
                  <span className="text-slate-400 uppercase font-bold text-[10px] tracking-wider">
                    {currentQuestion.type.replace('_', ' ')}
                  </span>
                </div>

                {/* Stimulus/Question text */}
                <div className="prose prose-sm leading-relaxed text-slate-850 text-[14px] font-medium whitespace-pre-wrap">
                  {currentQuestion.question}
                </div>

                {/* Question Image if exists */}
                {currentQuestion.imageUrl && (
                  <div className="my-4 rounded-xl overflow-hidden border border-slate-200 max-h-[300px] flex items-center justify-center bg-slate-50">
                    <img 
                      src={currentQuestion.imageUrl} 
                      alt={`Gambar Soal ${currentQuestion.number}`}
                      className="max-h-[300px] object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}

                {/* Interactive Answer Inputs based on Question Type */}
                <div className="pt-6 border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-3">Silakan Pilih / Isi Jawaban Anda:</p>

                  {/* TYPE 1: PILIHAN GANDA */}
                  {currentQuestion.type === 'PILIHAN_GANDA' && (
                    <div className="space-y-2">
                      {(currentQuestion.options || ['A', 'B', 'C', 'D', 'E']).map((opt, i) => {
                        const letter = ['A', 'B', 'C', 'D', 'E'][i] || 'A';
                        const isSelected = answers[currentQuestion.id] === letter;
                        return (
                          <button
                            key={i}
                            onClick={() => handleSelectAnswer(letter)}
                            className={`w-full text-left p-3 border rounded-xl flex items-center space-x-3 text-sm transition ${
                              isSelected
                                ? 'bg-blue-50 border-blue-600 text-blue-950 font-bold shadow-xs'
                                : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-800'
                            }`}
                          >
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold border shrink-0 ${
                              isSelected
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-slate-100 border-slate-200 text-slate-700'
                            }`}>
                              {letter}
                            </span>
                            <span>{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* TYPE 2: ISIAN SINGKAT */}
                  {currentQuestion.type === 'ISIAN_SINGKAT' && (
                    <div className="space-y-2 max-w-md">
                      <input
                        type="text"
                        value={answers[currentQuestion.id] || ''}
                        onChange={(e) => handleSelectAnswer(e.target.value)}
                        className="w-full p-4 border border-slate-300 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm transition font-semibold bg-slate-50/50 text-slate-800"
                        placeholder="Masukkan isian jawaban singkat Anda disini..."
                      />
                      <span className="text-[10px] text-slate-400">Pastikan penulisan format jawaban rapi dan jelas.</span>
                    </div>
                  )}

                  {/* TYPE 3: PILIHAN GANDA KOMPLEKS */}
                  {currentQuestion.type === 'PILIHAN_GANDA_KOMPLEKS' && (
                    <div className="space-y-4">
                      {currentQuestion.options && currentQuestion.options.map((opt, i) => {
                        const studentAnswersList = (answers[currentQuestion.id] || "").split(',');
                        const currentStatementAnswer = studentAnswersList[i] || "";

                        const handleSelectComplex = (value: string) => {
                          const nextList = [...studentAnswersList];
                          while(nextList.length < (currentQuestion.options || []).length) {
                            nextList.push("");
                          }
                          nextList[i] = value;
                          handleSelectAnswer(nextList.join(','));
                        };

                        return (
                          <div key={i} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                            <span className="font-semibold text-slate-800 flex-1 leading-relaxed">{opt}</span>
                            
                            <div className="flex items-center space-x-2 shrink-0">
                              <button
                                onClick={() => handleSelectComplex("Benar")}
                                className={`px-4 py-2 rounded-lg font-bold border transition ${
                                  currentStatementAnswer === "Benar"
                                    ? 'bg-emerald-600 border-emerald-600 text-white'
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                              >
                                Benar
                              </button>
                              <button
                                onClick={() => handleSelectComplex("Salah")}
                                className={`px-4 py-2 rounded-lg font-bold border transition ${
                                  currentStatementAnswer === "Salah"
                                    ? 'bg-rose-600 border-rose-600 text-white'
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                              >
                                Salah
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              </div>

              {/* Bottom Nav Controller */}
              <div className="flex items-center justify-between pt-6 border-t border-slate-100 mt-6 shrink-0">
                <button
                  onClick={handlePrev}
                  disabled={currentQuestionIndex === 0}
                  className="px-4 py-2.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-650 hover:bg-slate-50 disabled:opacity-30 inline-flex items-center space-x-1.5 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Soal Sebelumnya</span>
                </button>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="doubtCheckbox"
                    checked={doubtful[currentQuestion.id] || false}
                    onChange={handleToggleDoubtful}
                    className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="doubtCheckbox" className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-150 px-3 py-1.5 rounded-lg cursor-pointer transition select-none">
                    Ragu - Ragu
                  </label>
                </div>

                <button
                  onClick={handleNext}
                  disabled={currentQuestionIndex === questions.length - 1}
                  className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-30 inline-flex items-center space-x-1.5 transition"
                >
                  <span>Soal Berikutnya</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-8 flex-1 flex flex-col items-center justify-center text-slate-400">
              <FileText className="w-10 h-10 text-slate-200 mb-2 animate-pulse" />
              <span className="text-sm">Tidak ada soal yang tersedia.</span>
            </div>
          )}
        </div>

        {/* Navigation Sidebar Card */}
        <div className="lg:col-span-1 bg-white rounded-xl shadow-xs border border-slate-200 p-4 flex flex-col h-auto lg:h-[550px]">
          <h3 className="font-extrabold text-xs text-slate-400 uppercase mb-3 tracking-widest pb-2 border-b border-slate-200 flex items-center space-x-1.5 shrink-0 font-sans">
            <CheckCircle2 className="w-4 h-4 text-slate-400" />
            <span>Lembar Jawaban</span>
          </h3>

          <div className="flex-1 overflow-y-auto grid grid-cols-4 sm:grid-cols-5 gap-2 pr-1 mb-4">
            {questions.map((q, idx) => {
              const hasAnswered = !!answers[q.id];
              const isDoubt = doubtful[q.id];
              const isCurrent = currentQuestionIndex === idx;

              let btnStyle = "bg-white border-slate-200 text-slate-700 hover:border-blue-600";
              if (hasAnswered && !isDoubt) btnStyle = "bg-blue-600 border-blue-600 text-white shadow-xs";
              if (hasAnswered && isDoubt) btnStyle = "bg-amber-500 border-amber-500 text-white";
              if (!hasAnswered && isDoubt) btnStyle = "bg-amber-100 border-amber-300 text-amber-800";
              if (isCurrent) btnStyle += " ring-2 ring-slate-900 ring-offset-1 font-bold";

              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentQuestionIndex(idx)}
                  className={`aspect-square rounded-lg border text-xs font-bold transition flex items-center justify-center ${btnStyle}`}
                >
                  {q.number}
                </button>
              );
            })}
          </div>

          {/* Quick labels legend */}
          <div className="pt-3 border-t border-slate-200 space-y-2 text-[10px] text-slate-500 shrink-0 bg-white">
            <div className="flex items-center space-x-2">
              <span className="w-3.5 h-3.5 rounded bg-blue-600 inline-block"></span>
              <span>Sudah Dijawab</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3.5 h-3.5 rounded bg-amber-500 inline-block"></span>
              <span>Ragu-ragu (Ada Jawaban)</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3.5 h-3.5 rounded bg-white border border-slate-200 inline-block"></span>
              <span>Belum Dijawab</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, GitMerge, GitCommit, Activity, Code, X } from 'lucide-react';

// --- 상수 및 데이터 설정 ---
const LANES = [
  { id: 0, name: 'Frontend Agent', color: 'text-blue-400', border: 'border-blue-500', bg: 'bg-blue-900/30', key: 'd' },
  { id: 1, name: 'Backend Agent', color: 'text-green-400', border: 'border-green-500', bg: 'bg-green-900/30', key: 'f' },
  { id: 2, name: 'Database Agent', color: 'text-yellow-400', border: 'border-yellow-500', bg: 'bg-yellow-900/30', key: 'j' },
  { id: 3, name: 'AI Model Agent', color: 'text-purple-400', border: 'border-purple-500', bg: 'bg-purple-900/30', key: 'k' },
];

const PROJECTS = [
  { id: 'proj_b2c', name: '🚀 B2C Service App' },
  { id: 'proj_admin', name: '⚙️ Admin Backoffice' },
  { id: 'proj_api', name: '🔌 Core API Gateway' },
];

const MOCK_COMMITS = [
  { title: "JWT 토큰 검증 최적화", diff: "@@ -45,8 +45,12 @@\n- const verify = (token) => { return jwt.decode(token); }\n+ const verify = async (token) => {\n+   const decoded = await jwt.verify(token, process.env.SECRET);\n+   return decoded;\n+ }" },
  { title: "React 렌더링 개선", diff: "@@ -12,4 +12,5 @@\n- export default UserList;\n+ export default React.memo(UserList);" },
  { title: "사용자 테이블 인덱스", diff: "@@ -1,3 +1,4 @@\n CREATE TABLE users (\n   id INT PRIMARY KEY,\n-  email VARCHAR(255)\n+  email VARCHAR(255),\n+  INDEX idx_email (email)\n );" },
  { title: "프롬프트 시스템 미세조정", diff: "@@ -88,2 +88,2 @@\n- const prompt = `You are a helpful assistant.`;\n+ const prompt = `You are an expert developer. Always output valid JSON.`;" },
  { title: "모바일 네비게이션 픽스", diff: "@@ -20,3 +20,3 @@\n- <nav className=\"hidden md:flex\">\n+ <nav className=\"flex flex-col md:flex-row\">\n    <Links />\n  </nav>" },
  { title: "Redis 캐싱 레이어 도입", diff: "@@ -50,2 +50,5 @@\n  const data = await db.query(sql);\n+ await redis.set(cacheKey, JSON.stringify(data), 'EX', 3600);\n  return data;" },
];

const BASE_BOTTOM = 180; // 기준선 위치 (화면 하단 기준 픽셀)
const NOTE_HEIGHT_OFFSET = 85; // 노트가 쌓이는 간격
const NOTE_SPEED = 14; // 노트 낙하 속도 (픽셀/프레임)
const SPAWN_BOTTOM = 1000; // 노트 시작 위치 (바닥 기준)

// --- Web Audio API (타격음 생성기) ---
const playBeep = (freq, type = 'sine') => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {
    // Audio 방어 코드
  }
};

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState(PROJECTS[0].id);
  const [notes, setNotes] = useState([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [feedbacks, setFeedbacks] = useState([]);
  const [previewNote, setPreviewNote] = useState(null); // 코드 미리보기 모달 상태
  
  const requestRef = useRef();
  const notesRef = useRef([]);
  const activeProjectRef = useRef(activeProjectId);

  // 상태 동기화를 위한 Ref 업데이트
  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { activeProjectRef.current = activeProjectId; }, [activeProjectId]);

  // --- 게임 루프 (노트 물리 낙하 및 스택 연산) ---
  const updateGame = useCallback(() => {
    if (!isPlaying) return;

    setNotes((prevNotes) => {
      const counts = {}; // { 'projId_laneId': count }
      let hasChanges = false;
      
      const newNotes = prevNotes.map(note => {
        const key = `${note.projectId}_${note.lane}`;
        counts[key] = (counts[key] || 0);
        const index = counts[key]++;
        
        const targetBottom = BASE_BOTTOM + (index * NOTE_HEIGHT_OFFSET);
        
        if (note.currentBottom > targetBottom) {
          hasChanges = true;
          let nextBottom = note.currentBottom - NOTE_SPEED;
          if (nextBottom < targetBottom) nextBottom = targetBottom;
          return { ...note, currentBottom: nextBottom };
        }
        return note;
      });

      return hasChanges ? newNotes : prevNotes;
    });

    requestRef.current = requestAnimationFrame(updateGame);
  }, [isPlaying]);

  // 게임 루프 시작/종료
  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(updateGame);
    } else {
      cancelAnimationFrame(requestRef.current);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [isPlaying, updateGame]);

  // --- 노트(에이전트 커밋) 생성기 ---
  useEffect(() => {
    if (!isPlaying) return;

    let timeoutId;
    const spawnNote = () => {
      const laneIndex = Math.floor(Math.random() * 4);
      const commitData = MOCK_COMMITS[Math.floor(Math.random() * MOCK_COMMITS.length)];
      const randomProjectId = PROJECTS[Math.floor(Math.random() * PROJECTS.length)].id;
      
      setNotes(prev => {
        const laneNotes = prev.filter(n => n.lane === laneIndex && n.projectId === randomProjectId);
        if (laneNotes.length >= 6) return prev; // 스택 초과 방지
        
        const newNote = {
          id: Date.now() + Math.random(),
          projectId: randomProjectId,
          lane: laneIndex,
          title: commitData.title,
          diff: commitData.diff,
          currentBottom: SPAWN_BOTTOM,
        };
        return [...prev, newNote];
      });
      
      const nextTime = Math.random() * 1000 + 400; // 0.4초 ~ 1.4초 스폰 간격
      timeoutId = setTimeout(spawnNote, nextTime);
    };

    timeoutId = setTimeout(spawnNote, 1000);
    return () => clearTimeout(timeoutId);
  }, [isPlaying]);

  // --- 키보드 입력 처리 (마에스트로의 지휘) ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      // 미리보기 모달이 열려있거나 게임 중지 상태면 키보드 이벤트 무시 (Esc 제외)
      if (e.key === 'Escape') {
        setPreviewNote(null);
        return;
      }
      if (!isPlaying || previewNote) return;
      
      const key = e.key.toLowerCase();
      const currentProjectId = activeProjectRef.current;

      // 프로젝트 전환 (숫자 키 1, 2, 3)
      const projectIndex = parseInt(key) - 1;
      if (projectIndex >= 0 && projectIndex < PROJECTS.length) {
        setActiveProjectId(PROJECTS[projectIndex].id);
        return;
      }

      const laneMatch = LANES.find(l => l.key === key);
      
      if (laneMatch) {
        const freqs = [261.63, 329.63, 392.00, 523.25]; // 도미솔도
        playBeep(freqs[laneMatch.id], 'triangle');

        const currentNotes = notesRef.current;
        const laneNotes = currentNotes.filter(n => n.lane === laneMatch.id && n.projectId === currentProjectId);
        
        if (laneNotes.length > 0) {
          const targetNote = laneNotes[0]; // 가장 아래에 쌓인 노트
          
          // 승인 (Merge) 처리
          setNotes(prev => prev.filter(n => n.id !== targetNote.id));
          setScore(s => s + 100);
          setCombo(c => {
            const newCombo = c + 1;
            setMaxCombo(max => Math.max(max, newCombo));
            return newCombo;
          });
          showFeedback(currentProjectId, laneMatch.id, "MERGED!", "text-green-400");
        } else {
          showFeedback(currentProjectId, laneMatch.id, "EMPTY", "text-gray-500");
          setCombo(0);
        }
      }

      // 롤백 (Ctrl + Z)
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        showFeedback(currentProjectId, -1, "⏪ ROLLBACK EXECUTED", "text-yellow-400");
        setScore(s => Math.max(0, s - 100));
        setCombo(0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, previewNote]); // previewNote 상태 의존성 추가

  const showFeedback = (projectId, lane, text, color) => {
    const id = Date.now();
    setFeedbacks(prev => [...prev, { id, projectId, lane, text, color }]);
    setTimeout(() => {
      setFeedbacks(prev => prev.filter(f => f.id !== id));
    }, 500);
  };

  const startGame = () => {
    setNotes([]);
    setScore(0);
    setCombo(0);
    setIsPlaying(true);
  };

  const stopGame = () => {
    setIsPlaying(false);
    setNotes([]);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white font-sans overflow-hidden selection:bg-purple-500/30">
      
      {/* --- 상단 헤더 --- */}
      <header className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50 backdrop-blur-md z-10 shadow-lg relative">
        <div className="flex items-center space-x-3">
          <Activity className="w-6 h-6 text-purple-500" />
          <h1 className="text-xl font-bold tracking-tight">Maestro <span className="text-purple-400 font-light">Workspace</span></h1>
          <div className="ml-8 hidden sm:flex items-center px-3 py-1 bg-gray-800 rounded-full text-xs text-gray-300 border border-gray-700">
            <span className="animate-pulse mr-2 text-green-400">▶</span>
            Playing: J.S. Bach - Cello Suite No.1, Prelude
          </div>
        </div>

        <div className="flex items-center space-x-6">
          <div className="flex flex-col items-end">
            <span className="text-xs text-gray-400 uppercase tracking-wider">Merged PRs</span>
            <span className="text-2xl font-mono font-bold text-green-400">{score / 100}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs text-gray-400 uppercase tracking-wider">Max Combo</span>
            <span className="text-2xl font-mono font-bold text-purple-400">{maxCombo}</span>
          </div>
          
          {!isPlaying ? (
            <button onClick={startGame} className="flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-md font-medium transition-all shadow-[0_0_15px_rgba(168,85,247,0.5)]">
              <Play className="w-4 h-4 mr-2 fill-current" /> 지휘 시작
            </button>
          ) : (
            <button onClick={stopGame} className="flex items-center px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-md font-medium transition-all">
              <Square className="w-4 h-4 mr-2 fill-current" /> 중지
            </button>
          )}
        </div>
      </header>

      {/* --- 프로젝트 탭 바 --- */}
      <div className="flex bg-gray-900 border-b border-gray-800 px-4 overflow-x-auto z-10">
        {PROJECTS.map((project, idx) => {
          const pendingCount = notes.filter(n => n.projectId === project.id).length;
          const isActive = activeProjectId === project.id;
          return (
            <button
              key={project.id}
              onClick={() => setActiveProjectId(project.id)}
              className={`flex items-center px-6 py-3 border-b-2 font-medium text-sm transition-colors relative ${
                isActive ? 'border-purple-500 text-purple-400 bg-gray-800/50' : 'border-transparent text-gray-400 hover:text-gray-300 hover:bg-gray-800/30'
              }`}
            >
              <kbd className="hidden sm:inline-block mr-2 text-[10px] bg-gray-800 border border-gray-700 rounded px-1 text-gray-500">{idx + 1}</kbd>
              {project.name}
              {pendingCount > 0 && (
                <span className={`ml-3 px-2 py-0.5 rounded-full text-xs font-bold ${isActive ? 'bg-purple-500/20 text-purple-300' : 'bg-red-500/20 text-red-400 animate-pulse'}`}>
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* --- 메인 스테이지 --- */}
      <main className="flex-1 relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-900 via-gray-950 to-black">
        
        {combo > 2 && (
          <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-0 opacity-20 pointer-events-none flex flex-col items-center">
            <span className="text-8xl font-black italic">{combo}</span>
            <span className="text-2xl tracking-widest">COMBO</span>
          </div>
        )}

        {feedbacks.filter(f => f.lane === -1 && f.projectId === activeProjectId).map(feedback => (
          <div key={feedback.id} className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 animate-bounce">
            <span className={`text-3xl font-bold bg-black/80 px-6 py-3 rounded-lg border border-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.5)] ${feedback.color}`}>
              {feedback.text}
            </span>
          </div>
        ))}

        {/* 4개의 레인 */}
        <div className="absolute inset-0 flex justify-center max-w-5xl mx-auto px-4">
          {LANES.map((lane) => (
            <div key={lane.id} className="relative flex-1 flex flex-col border-r border-l border-gray-800/50 bg-gray-900/10 backdrop-blur-[2px]">
              
              <div className="absolute top-0 w-full p-4 text-center z-10 bg-gradient-to-b from-gray-900 to-transparent">
                <span className={`text-sm font-semibold tracking-wider ${lane.color}`}>{lane.name}</span>
              </div>

              {/* 쌓여있는 노트들 렌더링 */}
              {notes.filter(n => n.lane === lane.id && n.projectId === activeProjectId).map((note) => (
                <div 
                  key={note.id}
                  onClick={() => setPreviewNote(note)} // 클릭 시 코드 미리보기
                  className={`absolute left-4 right-4 p-3 rounded-lg border shadow-lg transition-colors duration-200 cursor-pointer hover:brightness-125 ${lane.bg} ${lane.border} group`}
                  style={{ bottom: `${note.currentBottom}px` }}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-start space-x-2 overflow-hidden">
                      <GitCommit className={`w-4 h-4 mt-0.5 shrink-0 ${lane.color}`} />
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-xs text-gray-400 truncate">Agent proposed:</span>
                        <span className="text-sm font-medium truncate group-hover:underline">{note.title}</span>
                      </div>
                    </div>
                    <Code className="w-4 h-4 text-gray-500 group-hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              ))}

              {/* 피드백 텍스트 */}
              {feedbacks.filter(f => f.lane === lane.id && f.projectId === activeProjectId).map(feedback => (
                <div 
                  key={feedback.id} 
                  className={`absolute w-full text-center z-50 font-bold text-xl tracking-widest animate-pulse ${feedback.color}`}
                  style={{ bottom: `${BASE_BOTTOM}px` }}
                >
                  {feedback.text}
                </div>
              ))}

              {/* 하단 판정선 및 단축키 안내 */}
              <div className="absolute w-full bottom-0 h-48 bg-gradient-to-t from-gray-900 to-transparent border-t border-gray-800 flex flex-col items-center justify-end pb-8">
                <div className={`absolute w-full h-1 bg-gray-700 shadow-[0_0_10px_rgba(255,255,255,0.1)]`} style={{ bottom: `${BASE_BOTTOM - 15}px` }} />
                
                <div className="relative">
                  <div className={`w-16 h-16 rounded-xl border-2 flex items-center justify-center bg-gray-900 ${lane.border} shadow-[0_0_15px_rgba(0,0,0,0.5)]`}>
                    <span className={`text-2xl font-bold uppercase ${lane.color}`}>{lane.key}</span>
                  </div>
                </div>
                
                <div className="mt-4 text-xs text-gray-500 font-mono">
                  <GitMerge className="w-3 h-3 inline mr-1" /> Approve
                </div>
              </div>

            </div>
          ))}
        </div>
      </main>

      {/* --- 하단 툴바 --- */}
      <footer className="p-3 bg-gray-900 border-t border-gray-800 text-xs text-gray-500 flex justify-between items-center z-10">
        <div>
          Tip: 떨어지는 노트를 <strong className="text-gray-300">클릭</strong>하여 코드 수정 내역(Diff)을 살짝 엿볼 수 있습니다.
        </div>
        <div className="flex space-x-4">
          <span className="flex items-center"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mx-1">1</kbd><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mr-1">2</kbd><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">3</kbd> 프로젝트 전환</span>
          <span className="flex items-center"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mx-1 text-gray-300">D F J K</kbd> 승인</span>
          <span className="flex items-center"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mr-1 text-gray-300">Ctrl+Z</kbd> 취소</span>
        </div>
      </footer>

      {/* --- 코드 미리보기 (Diff Peek) 모달 --- */}
      {previewNote && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-gray-800/50">
              <div className="flex items-center space-x-2">
                <GitCommit className="w-5 h-5 text-purple-400" />
                <h3 className="font-semibold text-gray-100">{previewNote.title}</h3>
              </div>
              <button onClick={() => setPreviewNote(null)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-gray-950 font-mono text-sm overflow-x-auto whitespace-pre">
              {previewNote.diff.split('\n').map((line, i) => {
                let colorClass = "text-gray-300";
                let bgClass = "";
                if (line.startsWith('+')) { colorClass = "text-green-400"; bgClass = "bg-green-900/20 w-full inline-block"; }
                if (line.startsWith('-')) { colorClass = "text-red-400"; bgClass = "bg-red-900/20 w-full inline-block"; }
                if (line.startsWith('@@')) { colorClass = "text-blue-400"; }
                
                return (
                  <span key={i} className={`${colorClass} ${bgClass} block px-2`}>
                    {line}
                  </span>
                );
              })}
            </div>
            <div className="p-3 border-t border-gray-800 bg-gray-900 text-right">
              <span className="text-xs text-gray-500 mr-4"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded">Esc</kbd> 로 닫기</span>
              <button onClick={() => setPreviewNote(null)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm transition-colors">
                확인
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

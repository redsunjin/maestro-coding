import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, GitMerge, GitCommit, Undo2, Activity } from 'lucide-react';

// --- 상수 및 설정 ---
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
  "JWT 토큰 검증 로직 최적화",
  "React 컴포넌트 렌더링 개선",
  "사용자 테이블 인덱스 추가",
  "프롬프트 엔지니어링 미세조정",
  "CSS Grid 모바일 대응",
  "Redis 캐싱 레이어 도입",
  "비동기 큐 워커 버그 수정",
  "Oauth2.0 로그인 연동",
];

const BASE_BOTTOM = 180; // 기준선 위치 (화면 하단 기준 픽셀)
const NOTE_HEIGHT_OFFSET = 85; // 노트가 쌓이는 간격
const NOTE_SPEED = 12; // 노트 낙하 속도 (픽셀/프레임)
const SPAWN_BOTTOM = 1000; // 노트가 처음 생성되는 화면 상단의 Y좌표 (바닥 기준)

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
    // Audio context failed to start, ignore
  }
};

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState(PROJECTS[0].id);
  const [notes, setNotes] = useState([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [feedbacks, setFeedbacks] = useState([]); // 타격 이펙트
  
  const requestRef = useRef();
  const notesRef = useRef([]);
  const activeProjectRef = useRef(activeProjectId);

  // 상태 동기화를 위한 Ref 업데이트
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    activeProjectRef.current = activeProjectId;
  }, [activeProjectId]);

  // --- 게임 루프 (노트 물리 낙하 및 스택 연산) ---
  const updateGame = useCallback(() => {
    if (!isPlaying) return;

    setNotes((prevNotes) => {
      // 프로젝트별, 레인별로 노트가 쌓인 인덱스를 계산하기 위한 카운터 맵
      const counts = {};
      let hasChanges = false;
      
      const newNotes = prevNotes.map(note => {
        const key = `${note.projectId}_${note.lane}`;
        counts[key] = (counts[key] || 0);
        const index = counts[key]++;
        
        // 현재 이 노트가 최종적으로 도달해야 할 바닥 위치 계산
        const targetBottom = BASE_BOTTOM + (index * NOTE_HEIGHT_OFFSET);
        
        // 노트가 아직 목표 위치에 도달하지 않았다면 낙하
        if (note.currentBottom > targetBottom) {
          hasChanges = true;
          let nextBottom = note.currentBottom - NOTE_SPEED;
          // 바닥(또는 아래쪽 노트)에 닿으면 정확히 목표 위치에 정지
          if (nextBottom < targetBottom) nextBottom = targetBottom;
          return { ...note, currentBottom: nextBottom };
        }
        return note;
      });

      // 변경사항(낙하 중인 노트)이 있을 때만 상태를 업데이트하여 렌더링 최적화
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
      const text = MOCK_COMMITS[Math.floor(Math.random() * MOCK_COMMITS.length)];
      // 랜덤으로 프로젝트 할당 (백그라운드에서 모든 프로젝트 작업 진행)
      const randomProjectId = PROJECTS[Math.floor(Math.random() * PROJECTS.length)].id;
      
      setNotes(prev => {
        const laneNotes = prev.filter(n => n.lane === laneIndex && n.projectId === randomProjectId);
        // 특정 프로젝트의 특정 레인에 너무 많은 노트가 쌓이지 않도록 제한
        if (laneNotes.length >= 6) return prev;
        
        const newNote = {
          id: Date.now() + Math.random(),
          projectId: randomProjectId,
          lane: laneIndex,
          text: text,
          currentBottom: SPAWN_BOTTOM, // 화면 위에서부터 떨어지도록 초기 Y값 지정
        };
        return [...prev, newNote];
      });
      
      // 다음 노트 생성 (에이전트 작업 완료 시뮬레이션)
      const nextTime = Math.random() * 1000 + 400; // 여러 프로젝트가 돌아가므로 스폰 주기를 조금 더 빠르게(0.4초~1.4초)
      timeoutId = setTimeout(spawnNote, nextTime);
    };

    timeoutId = setTimeout(spawnNote, 1000);
    return () => clearTimeout(timeoutId);
  }, [isPlaying]);

  // --- 키보드 입력 처리 (마에스트로의 지휘) ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isPlaying) return;
      
      const key = e.key.toLowerCase();
      const currentProjectId = activeProjectRef.current;

      // 숫자 키 1, 2, 3... 으로 프로젝트 탭 빠른 전환
      const projectIndex = parseInt(key) - 1;
      if (projectIndex >= 0 && projectIndex < PROJECTS.length) {
        setActiveProjectId(PROJECTS[projectIndex].id);
        return; // 프로젝트 전환 후 바로 종료
      }

      const laneMatch = LANES.find(l => l.key === key);
      
      if (laneMatch) {
        // 해당 레인에 효과음
        const freqs = [261.63, 329.63, 392.00, 523.25]; // C, E, G, C (도미솔도)
        playBeep(freqs[laneMatch.id], 'triangle');

        // *현재 활성화된 프로젝트*의 해당 레인 대기열에서 가장 오래된 노트 찾기
        const currentNotes = notesRef.current;
        const laneNotes = currentNotes.filter(n => n.lane === laneMatch.id && n.projectId === currentProjectId);
        
        if (laneNotes.length > 0) {
          // 가장 먼저 큐에 들어온 첫 번째 노트
          const targetNote = laneNotes[0];
          
          // 승인! (MERGE) - 승인 즉시 배열에서 제거됨. 
          // 제거되면 updateGame 루프에서 남은 노트들의 targetBottom이 갱신되어 자동으로 아래로 낙하(흐름)함.
          setNotes(prev => prev.filter(n => n.id !== targetNote.id));
          setScore(s => s + 100);
          setCombo(c => {
            const newCombo = c + 1;
            setMaxCombo(max => Math.max(max, newCombo));
            return newCombo;
          });
          showFeedback(currentProjectId, laneMatch.id, "MERGED!", "text-green-400");
        } else {
          // 비어있는 레인 누름 (콤보 초기화)
          showFeedback(currentProjectId, laneMatch.id, "EMPTY", "text-gray-500");
          setCombo(0);
        }
      }

      // Ctrl+Z 처리 (가짜 롤백 기능)
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        showFeedback(currentProjectId, -1, "⏪ ROLLBACK EXECUTED", "text-yellow-400");
        setScore(s => Math.max(0, s - 100));
        setCombo(0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying]);

  // 피드백 이펙트 표시 함수 (프로젝트 ID 추가)
  const showFeedback = (projectId, lane, text, color) => {
    const id = Date.now();
    setFeedbacks(prev => [...prev, { id, projectId, lane, text, color }]);
    setTimeout(() => {
      setFeedbacks(prev => prev.filter(f => f.id !== id));
    }, 500); // 0.5초 후 이펙트 제거
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
      
      {/* --- 상단 헤더 / 대시보드 --- */}
      <header className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50 backdrop-blur-md z-10 shadow-lg">
        <div className="flex items-center space-x-3">
          <Activity className="w-6 h-6 text-purple-500" />
          <h1 className="text-xl font-bold tracking-tight">Maestro <span className="text-purple-400 font-light">Workspace</span></h1>
          
          {/* 가상 음악 플레이어 UI */}
          <div className="ml-8 hidden sm:flex items-center px-3 py-1 bg-gray-800 rounded-full text-xs text-gray-300 border border-gray-700">
            <span className="animate-pulse mr-2 text-green-400">▶</span>
            Playing: J.S. Bach - Goldberg Variations, BWV 988
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
            <button 
              onClick={startGame}
              className="flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-md font-medium transition-all shadow-[0_0_15px_rgba(168,85,247,0.5)]"
            >
              <Play className="w-4 h-4 mr-2 fill-current" /> 지휘 시작
            </button>
          ) : (
            <button 
              onClick={stopGame}
              className="flex items-center px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-md font-medium transition-all"
            >
              <Square className="w-4 h-4 mr-2 fill-current" /> 중지
            </button>
          )}
        </div>
      </header>

      {/* --- 프로젝트 탭 바 (다중 프로젝트 관리) --- */}
      <div className="flex bg-gray-900 border-b border-gray-800 px-4 overflow-x-auto">
        {PROJECTS.map((project, idx) => {
          const pendingCount = notes.filter(n => n.projectId === project.id).length;
          const isActive = activeProjectId === project.id;
          return (
            <button
              key={project.id}
              onClick={() => setActiveProjectId(project.id)}
              className={`flex items-center px-6 py-3 border-b-2 font-medium text-sm transition-colors relative ${
                isActive 
                  ? 'border-purple-500 text-purple-400 bg-gray-800/50' 
                  : 'border-transparent text-gray-400 hover:text-gray-300 hover:bg-gray-800/30'
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

      {/* --- 메인 게임 스테이지 --- */}
      <main className="flex-1 relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-900 via-gray-950 to-black">
        
        {/* 중앙 콤보 표시 */}
        {combo > 2 && (
          <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-0 opacity-20 pointer-events-none flex flex-col items-center">
            <span className="text-8xl font-black italic">{combo}</span>
            <span className="text-2xl tracking-widest">COMBO</span>
          </div>
        )}

        {/* 롤백 피드백 (전체 화면 중앙) - 현재 활성화된 프로젝트의 롤백만 표시 */}
        {feedbacks.filter(f => f.lane === -1 && f.projectId === activeProjectId).map(feedback => (
          <div key={feedback.id} className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 animate-bounce">
            <span className={`text-3xl font-bold bg-black/80 px-6 py-3 rounded-lg border border-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.5)] ${feedback.color}`}>
              {feedback.text}
            </span>
          </div>
        ))}

        {/* 4개의 레인 (Worktrees) */}
        <div className="absolute inset-0 flex justify-center max-w-5xl mx-auto px-4">
          {LANES.map((lane) => (
            <div key={lane.id} className="relative flex-1 flex flex-col border-r border-l border-gray-800/50 bg-gray-900/10 backdrop-blur-[2px]">
              
              {/* 레인 헤더 */}
              <div className="absolute top-0 w-full p-4 text-center z-10 bg-gradient-to-b from-gray-900 to-transparent">
                <span className={`text-sm font-semibold tracking-wider ${lane.color}`}>
                  {lane.name}
                </span>
              </div>

              {/* 쌓여있는 노트들 (물리 낙하 렌더링) - 현재 탭의 프로젝트만 필터링 */}
              {notes.filter(n => n.lane === lane.id && n.projectId === activeProjectId).map((note) => (
                <div 
                  key={note.id}
                  // JS 연산과 CSS 애니메이션이 충돌하지 않도록 transition-all 제거 (colors, shadow 정도만 유지)
                  className={`absolute left-4 right-4 p-3 rounded-lg border shadow-lg transition-colors duration-200 ${lane.bg} ${lane.border}`}
                  style={{ bottom: `${note.currentBottom}px` }}
                >
                  <div className="flex items-start space-x-2">
                    <GitCommit className={`w-4 h-4 mt-0.5 shrink-0 ${lane.color}`} />
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-xs text-gray-400 truncate">Agent proposed:</span>
                      <span className="text-sm font-medium truncate">{note.text}</span>
                    </div>
                  </div>
                </div>
              ))}

              {/* 피드백 텍스트 (MERGED / EMPTY) - 현재 탭의 피드백만 표시 */}
              {feedbacks.filter(f => f.lane === lane.id && f.projectId === activeProjectId).map(feedback => (
                <div 
                  key={feedback.id} 
                  className={`absolute w-full text-center z-50 font-bold text-xl tracking-widest animate-pulse ${feedback.color}`}
                  style={{ bottom: `${BASE_BOTTOM}px` }}
                >
                  {feedback.text}
                </div>
              ))}

              {/* 하단 판정선 (Hit Zone) 및 단축키 안내 */}
              <div 
                className="absolute w-full bottom-0 h-48 bg-gradient-to-t from-gray-900 to-transparent border-t border-gray-800 flex flex-col items-center justify-end pb-8"
              >
                {/* 판정 라인 시각화 */}
                <div 
                  className={`absolute w-full h-1 bg-gray-700 shadow-[0_0_10px_rgba(255,255,255,0.1)]`}
                  style={{ bottom: `${BASE_BOTTOM - 15}px` }} 
                />
                
                {/* 실제 키보드 타격 표시기 */}
                <div className="relative">
                  <div className={`w-16 h-16 rounded-xl border-2 flex items-center justify-center bg-gray-900 ${lane.border} transition-all duration-100 peer shadow-[0_0_15px_rgba(0,0,0,0.5)]`}>
                    <span className={`text-2xl font-bold uppercase ${lane.color}`}>{lane.key}</span>
                  </div>
                  {/* 키보드를 눌렀을 때만 빛나는 효과 (CSS로는 복잡하므로 JS 상태 의존 없이 hover/active 흉내, 실제는 키다운 이벤트로 처리하는게 완벽하지만 데모용 간소화) */}
                  <div className={`absolute -bottom-4 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full ${lane.bg} shadow-[0_0_20px_10px_${lane.color.replace('text-', '')}] opacity-0 transition-opacity duration-100`}></div>
                </div>
                
                <div className="mt-4 text-xs text-gray-500 font-mono">
                  <GitMerge className="w-3 h-3 inline mr-1" />
                  Approve
                </div>
              </div>

            </div>
          ))}
        </div>
      </main>

      {/* --- 하단 툴바 / 단축키 안내 --- */}
      <footer className="p-3 bg-gray-900 border-t border-gray-800 text-xs text-gray-500 flex justify-between items-center">
        <div>
          Tip: 숫자키 <kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mx-1">1</kbd><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mr-1">2</kbd><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">3</kbd> 으로 프로젝트를 전환하며 승인 대기열을 처리하세요.
        </div>
        <div className="flex space-x-4">
          <span className="flex items-center"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mr-1 text-gray-300">D</kbd><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mr-1 text-gray-300">F</kbd><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mr-1 text-gray-300">J</kbd><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mr-1 text-gray-300">K</kbd> 승인(Merge)</span>
          <span className="flex items-center"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mr-1 text-gray-300">Ctrl + Z</kbd> 직전 승인 취소 (Undo)</span>
        </div>
      </footer>

    </div>
  );
}

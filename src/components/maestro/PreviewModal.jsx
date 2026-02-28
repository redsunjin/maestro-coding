import React from 'react';
import { GitCommit, X } from 'lucide-react';

export default function PreviewModal({ previewNote, onClose }) {
  if (!previewNote) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-gray-800/50">
          <div className="flex items-center space-x-2">
            <GitCommit className="w-5 h-5 text-purple-400" />
            <h3 className="font-semibold text-gray-100">{previewNote.title}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
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
          <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm transition-colors">
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

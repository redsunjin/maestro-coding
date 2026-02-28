import React from 'react';

export default function ProjectTabs({
  projects,
  notes,
  activeProjectId,
  onSelectProject,
}) {
  return (
    <div className="flex bg-gray-900 border-b border-gray-800 px-4 overflow-x-auto z-10">
      {projects.map((project, idx) => {
        const pendingCount = notes.filter((note) => note.projectId === project.id).length;
        const isActive = activeProjectId === project.id;
        return (
          <button
            key={project.id}
            onClick={() => onSelectProject(project.id)}
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
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getStoredString, setStoredValue } from '../utils/storage.js';
import { SERVER_API_TOKEN_STORAGE_KEY } from '../constants/ops.js';
import { DEFAULT_LANE_COUNT, sanitizeLaneCount } from '../constants/maestro.js';

const PROJECT_REFRESH_DEBOUNCE_MS = 300;

function toApiUrl(wsUrl, path) {
  try {
    const parsedWsUrl = new URL(wsUrl);
    const protocol = parsedWsUrl.protocol === 'wss:' ? 'https:' : 'http:';
    return `${protocol}//${parsedWsUrl.host}${path}`;
  } catch {
    return path;
  }
}

function buildAuthHeaders(token) {
  if (!token) return {};
  return {
    Authorization: `Bearer ${token}`,
  };
}

function normalizeText(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized || fallback;
}

function normalizeProject(item = {}) {
  return {
    id: normalizeText(item.id, `runtime_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    name: normalizeText(item.name, 'unknown project'),
    path: normalizeText(item.path),
    repoUrl: normalizeText(item.repoUrl),
    laneCount: sanitizeLaneCount(item.laneCount, DEFAULT_LANE_COUNT),
    isActive: item.isActive === true,
  };
}

function getProjectErrorMessage(errorCode, projectPath = '') {
  switch (errorCode) {
    case 'PROJECT_PATH_REQUIRED':
      return '프로젝트 폴더 경로를 입력해주세요.';
    case 'PROJECT_PATH_NOT_FOUND':
      return `프로젝트 폴더를 찾을 수 없습니다: ${projectPath || 'unknown path'}`;
    case 'PROJECT_PATH_NOT_GIT':
      return `Git 레포 루트가 아닙니다: ${projectPath || 'unknown path'}`;
    case 'Project not found':
      return '선택한 프로젝트를 찾을 수 없습니다.';
    default:
      return '';
  }
}

async function readProjectApiError(response, fallbackMessage) {
  try {
    const body = await response.json();
    return getProjectErrorMessage(body.error, body.path) || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

export default function useProjectRegistryOps({ wsUrl }) {
  const [projectItems, setProjectItems] = useState([]);
  const [currentProject, setCurrentProject] = useState(() => normalizeProject({
    id: 'runtime_default',
    name: 'runtime',
    path: '',
    repoUrl: '',
    laneCount: DEFAULT_LANE_COUNT,
    isActive: true,
  }));
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectError, setProjectError] = useState('');
  const [isProjectLoading, setIsProjectLoading] = useState(false);
  const [isProjectApplying, setIsProjectApplying] = useState(false);
  const [isProjectRegistering, setIsProjectRegistering] = useState(false);
  const [isProjectPanelOpen, setIsProjectPanelOpen] = useState(false);
  const [projectApiToken, setProjectApiToken] = useState(() => getStoredString(SERVER_API_TOKEN_STORAGE_KEY, ''));
  const [projectTokenInput, setProjectTokenInput] = useState(() => getStoredString(SERVER_API_TOKEN_STORAGE_KEY, ''));
  const [isProjectAuthRequired, setIsProjectAuthRequired] = useState(false);
  const [lastProjectUpdatedAt, setLastProjectUpdatedAt] = useState(null);
  const [newProjectPath, setNewProjectPath] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectRepoUrl, setNewProjectRepoUrl] = useState('');
  const [newProjectLaneCount, setNewProjectLaneCount] = useState(String(DEFAULT_LANE_COUNT));

  const refreshTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const currentProjectRef = useRef(currentProject);

  useEffect(() => {
    currentProjectRef.current = currentProject;
  }, [currentProject]);

  const applyProjectPayload = useCallback((body = {}) => {
    const items = Array.isArray(body.items) ? body.items.map((item) => normalizeProject(item)) : [];
    const normalizedCurrentProject = normalizeProject(
      body.currentProject || items.find((item) => item.isActive) || currentProjectRef.current,
    );
    setProjectItems(items);
    setCurrentProject(normalizedCurrentProject);
    setSelectedProjectId(normalizedCurrentProject.id);
    setProjectError('');
    setIsProjectAuthRequired(false);
    setLastProjectUpdatedAt(new Date().toISOString());
  }, []);

  const refreshProjects = useCallback(async () => {
    setIsProjectLoading(true);
    try {
      const response = await fetch(toApiUrl(wsUrl, '/api/projects'), {
        method: 'GET',
        headers: buildAuthHeaders(projectApiToken),
      });

      if (response.status === 401) {
        if (!mountedRef.current) return;
        setIsProjectAuthRequired(true);
        setProjectError('프로젝트 전환 API 인증이 필요합니다. 서버 토큰을 입력해주세요.');
        return;
      }

      if (!response.ok) {
        throw new Error(await readProjectApiError(response, '프로젝트 목록을 불러오지 못했습니다.'));
      }

      const body = await response.json();
      if (!mountedRef.current) return;
      applyProjectPayload(body);
    } catch (error) {
      if (!mountedRef.current) return;
      const message = error instanceof Error ? error.message : '프로젝트 목록을 불러오지 못했습니다.';
      setProjectError(message);
    } finally {
      if (mountedRef.current) {
        setIsProjectLoading(false);
      }
    }
  }, [applyProjectPayload, projectApiToken, wsUrl]);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    if (!isProjectPanelOpen) return undefined;
    refreshProjects();
    return undefined;
  }, [isProjectPanelOpen, refreshProjects]);

  useEffect(() => () => {
    mountedRef.current = false;
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
  }, []);

  const selectedProject = useMemo(
    () => projectItems.find((item) => item.id === selectedProjectId) || currentProject,
    [currentProject, projectItems, selectedProjectId],
  );

  const applySelectedProject = useCallback(async () => {
    if (!selectedProjectId) return;
    setIsProjectApplying(true);
    try {
      const response = await fetch(toApiUrl(wsUrl, '/api/projects/select'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(projectApiToken),
        },
        body: JSON.stringify({
          projectId: selectedProjectId,
        }),
      });

      if (response.status === 401) {
        if (!mountedRef.current) return;
        setIsProjectAuthRequired(true);
        setProjectError('프로젝트 전환 API 인증이 필요합니다. 서버 토큰을 입력해주세요.');
        return;
      }

      if (!response.ok) {
        throw new Error(await readProjectApiError(response, '프로젝트 전환에 실패했습니다.'));
      }

      const body = await response.json();
      if (!mountedRef.current) return;
      applyProjectPayload(body);
    } catch (error) {
      if (!mountedRef.current) return;
      const message = error instanceof Error ? error.message : '프로젝트 전환에 실패했습니다.';
      setProjectError(message);
    } finally {
      if (mountedRef.current) {
        setIsProjectApplying(false);
      }
    }
  }, [applyProjectPayload, projectApiToken, selectedProjectId, wsUrl]);

  const registerProject = useCallback(async () => {
    setIsProjectRegistering(true);
    try {
      const response = await fetch(toApiUrl(wsUrl, '/api/projects/register'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(projectApiToken),
        },
        body: JSON.stringify({
          projectPath: newProjectPath,
          projectName: newProjectName,
          repoUrl: newProjectRepoUrl,
          laneCount: sanitizeLaneCount(newProjectLaneCount, DEFAULT_LANE_COUNT),
          activate: true,
        }),
      });

      if (response.status === 401) {
        if (!mountedRef.current) return;
        setIsProjectAuthRequired(true);
        setProjectError('프로젝트 전환 API 인증이 필요합니다. 서버 토큰을 입력해주세요.');
        return;
      }

      if (!response.ok) {
        throw new Error(await readProjectApiError(response, '프로젝트 등록에 실패했습니다.'));
      }

      const body = await response.json();
      if (!mountedRef.current) return;
      applyProjectPayload(body);
      setNewProjectPath('');
      setNewProjectName('');
      setNewProjectRepoUrl('');
      setNewProjectLaneCount(String(DEFAULT_LANE_COUNT));
    } catch (error) {
      if (!mountedRef.current) return;
      const message = error instanceof Error ? error.message : '프로젝트 등록에 실패했습니다.';
      setProjectError(message);
    } finally {
      if (mountedRef.current) {
        setIsProjectRegistering(false);
      }
    }
  }, [applyProjectPayload, newProjectLaneCount, newProjectName, newProjectPath, newProjectRepoUrl, projectApiToken, wsUrl]);

  const saveProjectToken = useCallback(() => {
    const normalizedToken = projectTokenInput.trim();
    setStoredValue(SERVER_API_TOKEN_STORAGE_KEY, normalizedToken);
    setProjectApiToken(normalizedToken);
    setProjectTokenInput(normalizedToken);
  }, [projectTokenInput]);

  const clearProjectToken = useCallback(() => {
    setStoredValue(SERVER_API_TOKEN_STORAGE_KEY, '');
    setProjectApiToken('');
    setProjectTokenInput('');
  }, []);

  const handleSocketEvent = useCallback((payload) => {
    if (payload?.event !== 'PROJECT_SWITCHED') return;

    if (payload.currentProject) {
      setCurrentProject(normalizeProject(payload.currentProject));
    }

    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = setTimeout(() => {
      refreshProjects();
    }, PROJECT_REFRESH_DEBOUNCE_MS);
  }, [refreshProjects]);

  return {
    projectItems,
    currentProject,
    selectedProject,
    selectedProjectId,
    setSelectedProjectId,
    projectError,
    isProjectLoading,
    isProjectApplying,
    isProjectPanelOpen,
    setIsProjectPanelOpen,
    projectTokenInput,
    setProjectTokenInput,
    saveProjectToken,
    clearProjectToken,
    isProjectAuthRequired,
    hasProjectApiToken: projectApiToken.length > 0,
    lastProjectUpdatedAt,
    newProjectPath,
    setNewProjectPath,
    newProjectName,
    setNewProjectName,
    newProjectRepoUrl,
    setNewProjectRepoUrl,
    newProjectLaneCount,
    setNewProjectLaneCount,
    refreshProjects,
    applySelectedProject,
    registerProject,
    isProjectRegistering,
    handleSocketEvent,
  };
}

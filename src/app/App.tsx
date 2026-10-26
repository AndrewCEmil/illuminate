import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Editor } from '../components/Editor';
import { Toast } from '../components/Dialogs';
import type { ToastMessage } from '../components/Dialogs';
import { ProjectList } from '../components/ProjectList';
import { ImageImportError, makeThumbnail, nameFromFile, processReferenceImage } from '../data/imageImport';
import type { ArtworkProject } from '../data/models';
import { createProjectDocument, newId } from '../data/models';
import {
  createProject,
  deleteProject,
  getLastProjectId,
  listProjects,
  loadImage,
  loadProject,
  loadViewport,
  renameProject,
  requestPersistentStorage,
  setLastProjectId,
} from '../data/projectRepository';
import { ValidationError } from '../data/validation';
import type { Viewport } from '../editor/viewport';
import { parseBackup } from '../export/projectBackup';

type Screen =
  | { kind: 'loading' }
  | { kind: 'list' }
  | { kind: 'editor'; project: ArtworkProject; image: Blob | null; viewport: Viewport | null };

const EDITOR_HISTORY_STATE = { screen: 'editor' };

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const [projects, setProjects] = useState<ArtworkProject[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastId = useRef(0);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });

  const notify = useCallback((text: string, tone: 'info' | 'error' = 'info', sticky = false) => {
    setToast({ id: ++toastId.current, text, tone, sticky });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  const refreshList = useCallback(async () => {
    try {
      const { projects: list, invalidCount } = await listProjects();
      setProjects(list);
      if (invalidCount) notify(`${invalidCount} stored project(s) could not be read and were skipped.`, 'error');
    } catch (err) {
      notify(`Couldn’t open local storage: ${err instanceof Error ? err.message : String(err)}`, 'error', true);
    }
  }, [notify]);

  const openProject = useCallback(
    async (id: string, pushHistory = true) => {
      try {
        const project = await loadProject(id);
        if (!project) {
          notify('That project no longer exists', 'error');
          await setLastProjectId(null);
          return false;
        }
        const [image, viewport] = await Promise.all([loadImage(project.reference.id), loadViewport(id)]);
        if (!image) notify('The reference image for this project is missing', 'error');
        await setLastProjectId(id);
        if (pushHistory) window.history.pushState(EDITOR_HISTORY_STATE, '');
        setScreen({ kind: 'editor', project, image, viewport });
        return true;
      } catch (err) {
        notify(`Couldn’t open project: ${err instanceof Error ? err.message : String(err)}`, 'error');
        return false;
      }
    },
    [notify],
  );

  // Startup: reopen the last project, otherwise show the list.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshList();
      const last = await getLastProjectId().catch(() => null);
      if (cancelled) return;
      if (!(last && (await openProject(last)))) setScreen({ kind: 'list' });
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshList, openProject]);

  const closeEditor = useCallback(async () => {
    await setLastProjectId(null).catch(() => {});
    await refreshList();
    setScreen({ kind: 'list' });
  }, [refreshList]);

  // Android back button / browser back leaves the editor (the editor flushes first).
  const editorBack = useRef<(() => void) | null>(null);
  useEffect(() => {
    const onPop = () => editorBack.current?.();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const createFromImage = useCallback(
    async (file: File) => {
      setBusy('Preparing image…');
      try {
        const processed = await processReferenceImage(file);
        const doc = createProjectDocument({ name: nameFromFile(file), imageId: newId('img'), width: processed.width, height: processed.height });
        await createProject(doc, processed.blob, processed.thumbnail);
        void requestPersistentStorage();
        await refreshList();
        await openProject(doc.id);
      } catch (err) {
        notify(err instanceof ImageImportError ? err.message : `Couldn’t create project: ${err instanceof Error ? err.message : String(err)}`, 'error');
      } finally {
        setBusy(null);
      }
    },
    [notify, openProject, refreshList],
  );

  const importBackup = useCallback(
    async (file: File) => {
      setBusy('Restoring backup…');
      try {
        const { project, image } = parseBackup(await file.text());
        const restored = { ...project, name: `${project.name} (restored)` };
        await createProject(restored, image, await makeThumbnail(image));
        await refreshList();
        notify(`Restored “${restored.name}”`);
      } catch (err) {
        notify(err instanceof ValidationError ? `Invalid backup — ${err.message}` : `Couldn’t restore backup: ${err instanceof Error ? err.message : String(err)}`, 'error');
      } finally {
        setBusy(null);
      }
    },
    [notify, refreshList],
  );

  if (screen.kind === 'loading') return <div className="splash" />;

  return (
    <>
      {screen.kind === 'list' && (
        <ProjectList
          projects={projects}
          busy={busy}
          updateAvailable={needRefresh}
          onUpdate={() => void updateServiceWorker(true)}
          onOpen={(id) => void openProject(id)}
          onCreate={(f) => void createFromImage(f)}
          onImportBackup={(f) => void importBackup(f)}
          onRename={(id, name) => void renameProject(id, name).then(refreshList)}
          onDelete={(id) =>
            void deleteProject(id)
              .then(refreshList)
              .catch((err: unknown) => notify(`Delete failed: ${String(err)}`, 'error'))
          }
        />
      )}
      {screen.kind === 'editor' && (
        <EditorScreen key={screen.project.id} screen={screen} notify={notify} onClosed={closeEditor} backRef={editorBack} />
      )}
      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}

/** Wires the editor's back button to browser history so Android back behaves naturally. */
function EditorScreen({
  screen,
  notify,
  onClosed,
  backRef,
}: {
  screen: Extract<Screen, { kind: 'editor' }>;
  notify: (text: string, tone?: 'info' | 'error', sticky?: boolean) => void;
  onClosed: () => Promise<void>;
  backRef: React.RefObject<(() => void) | null>;
}) {
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const leaving = useRef(false);
  const registerFlush = useCallback((f: () => Promise<void>) => {
    flushRef.current = f;
  }, []);

  useEffect(() => {
    // Called on popstate (system back, or our own back button via history.back()).
    backRef.current = () => {
      if (leaving.current) return;
      leaving.current = true;
      void (flushRef.current?.() ?? Promise.resolve()).finally(() => void onClosed());
    };
    return () => {
      backRef.current = null;
    };
  }, [backRef, onClosed]);

  return (
    <Editor
      project={screen.project}
      image={screen.image}
      initialViewport={screen.viewport}
      notify={notify}
      registerFlush={registerFlush}
      onBack={() => {
        if (window.history.state?.screen === 'editor') window.history.back();
        else backRef.current?.();
      }}
    />
  );
}

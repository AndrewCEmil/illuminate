import { useEffect, useRef, useState } from 'react';
import type { ArtworkProject } from '../data/models';
import { paletteLookup } from '../data/models';
import { loadImage, thumbKey } from '../data/projectRepository';
import { ConfirmDialog, PromptDialog } from './Dialogs';
import { IconPencil, IconPlus, IconTrash, IconUpload } from './icons';

type Props = {
  projects: ArtworkProject[];
  busy: string | null;
  updateAvailable: boolean;
  onUpdate: () => void;
  onOpen: (id: string) => void;
  onCreate: (file: File) => void;
  onImportBackup: (file: File) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function ProjectList(p: Props) {
  const imageInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const [renaming, setRenaming] = useState<ArtworkProject | null>(null);
  const [deleting, setDeleting] = useState<ArtworkProject | null>(null);

  return (
    <div className="projects">
      <header className="projects-header">
        <h1>Manuscript Studio</h1>
        <button type="button" className="text-btn" onClick={() => backupInput.current?.click()}>
          <IconUpload /> Import backup
        </button>
      </header>

      {p.updateAvailable && (
        <div className="update-banner">
          A new version is ready.
          <button type="button" className="text-btn primary" onClick={p.onUpdate}>
            Update
          </button>
        </div>
      )}

      <main className="project-grid">
        <button type="button" className="project-card new" onClick={() => imageInput.current?.click()} disabled={!!p.busy}>
          <IconPlus />
          <span>New from image</span>
        </button>
        {p.projects.map((proj) => (
          <div className="project-card" key={proj.id}>
            <button type="button" className="project-open" onClick={() => p.onOpen(proj.id)} aria-label={`Open ${proj.name}`}>
              <Thumbnail project={proj} />
              <span className="project-name">{proj.name}</span>
              <span className="project-meta">
                {proj.shapes.length} shape{proj.shapes.length === 1 ? '' : 's'} · {formatTime(proj.updatedAt)}
              </span>
            </button>
            <div className="project-actions">
              <button type="button" className="icon-btn small" aria-label={`Rename ${proj.name}`} onClick={() => setRenaming(proj)}>
                <IconPencil />
              </button>
              <button type="button" className="icon-btn small" aria-label={`Delete ${proj.name}`} onClick={() => setDeleting(proj)}>
                <IconTrash />
              </button>
            </div>
          </div>
        ))}
      </main>

      {p.projects.length === 0 && (
        <p className="empty-note">Start by choosing a reference image — an illuminated manuscript page works beautifully. Everything stays on this device.</p>
      )}
      {p.busy && <div className="busy">{p.busy}</div>}

      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        hidden
        data-testid="image-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) p.onCreate(f);
        }}
      />
      <input
        ref={backupInput}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="backup-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) p.onImportBackup(f);
        }}
      />

      {renaming && (
        <PromptDialog
          title="Rename project"
          initialValue={renaming.name}
          confirmLabel="Rename"
          onCancel={() => setRenaming(null)}
          onConfirm={(name) => {
            p.onRename(renaming.id, name);
            setRenaming(null);
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete project?"
          message={`“${deleting.name}” and its reference image will be permanently removed from this device.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            p.onDelete(deleting.id);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}

function Thumbnail({ project }: { project: ArtworkProject }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    void loadImage(thumbKey(project.reference.id)).then((blob) => {
      if (!blob || revoked) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [project.reference.id]);
  const colors = paletteLookup(project.palette);
  return (
    <svg className="thumb" viewBox={`0 0 ${project.width} ${project.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect width={project.width} height={project.height} fill="#000" />
      {url && <image href={url} width={project.width} height={project.height} opacity={project.shapes.length ? 0.25 : 0.6} preserveAspectRatio="none" />}
      {project.shapes.map((s) => (
        <polygon key={s.id} points={s.points.map((pt) => `${pt.x},${pt.y}`).join(' ')} fill={colors.get(s.colorId)} />
      ))}
    </svg>
  );
}

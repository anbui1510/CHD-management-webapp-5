import React, { useState } from 'react';
import { DEFAULT_CATEGORIES } from '../store/constants';
import { PALETTE_MIME, palettePayload } from '../logic/paletteDrop';

export function TaskPalette({ tasks, categories = DEFAULT_CATEGORIES, staff = [] }) {
  const [tab, setTab] = useState('task');
  const knownKeys = new Set(categories.map(c => c.key));
  const grouped = {};
  tasks.forEach(task => {
    const cat = knownKeys.has(task.category) ? task.category : 'CHUYEN_MON';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(task);
  });

  const startDrag = (event, kind, text, extra) => {
    event.dataTransfer.setData('text/plain', text);
    event.dataTransfer.setData(PALETTE_MIME, palettePayload(kind, text));
    if (extra) event.dataTransfer.setData('application/json', JSON.stringify(extra));
    event.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside className="task-palette" title="Kéo thả vào ô lịch">
      <div className="palette-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={`palette-tab ${tab === 'task' ? 'active' : ''}`}
          aria-selected={tab === 'task'}
          onClick={() => setTab('task')}
        >
          Task
        </button>
        <button
          type="button"
          role="tab"
          className={`palette-tab ${tab === 'staff' ? 'active' : ''}`}
          aria-selected={tab === 'staff'}
          onClick={() => setTab('staff')}
        >
          Staff
        </button>
      </div>

      <div className="task-palette-list">
        {tab === 'task' ? categories.map((category) => {
          const list = grouped[category.key] || [];
          if (list.length === 0) return null;
          return (
            <div key={category.key} className="task-group" title={category.label}>
              <div className="task-badge-list">
                {list.map(task => (
                  <div
                    key={task.id}
                    className="task-chip"
                    draggable
                    onDragStart={(event) => startDrag(event, 'task', task.code, task)}
                    style={{
                      backgroundColor: task.bgColor || '#1f2937',
                      color: task.textColor || '#ffffff'
                    }}
                    title={`${task.code} — ${task.name}`}
                  >
                    <span className="task-code">{task.code}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        }) : staff.map(person => (
          <div
            key={person.id}
            className="task-chip staff-chip"
            draggable
            onDragStart={(event) => startDrag(event, 'staff', person.shortName, person)}
            title={`${person.shortName} — ${person.name}${person.title ? ` · ${person.title}` : ''}`}
          >
            <span className="task-code">{person.shortName}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

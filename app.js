// ─────────────────────────────────────────────
// CONFIGURACIÓN GOOGLE SHEETS
// ─────────────────────────────────────────────
// 1. Crea tu hoja con estas columnas (fila 1 = encabezados):
//    nombre | foto | posicion | disponibilidad | descripcion | video
// 2. Archivo → Compartir → Publicar en la web → CSV
// 3. Pegá la URL aquí:
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1TWntlnHPG7ogpIjC2J06-WGtRlji4oKdXoiLMHFSmE8/export?format=csv';  // <-- pegar URL aquí

// ─────────────────────────────────────────────
// FILTROS: posiciones y disponibilidades
// ─────────────────────────────────────────────
const POSITIONS = [
  { value: 'all',       label: 'Todas'      },
  { value: 'Base',      label: 'Base'       },
  { value: 'Escolta',   label: 'Escolta'    },
  { value: 'Alero',     label: 'Alero'      },
  { value: 'Ala-Pívot', label: 'Ala-Pívot' },
  { value: 'Pívot',     label: 'Pívot'      },
];

const AVAILABILITIES = [
  { value: 'all',           label: 'Todos'         },
  { value: 'disponible',    label: 'Disponible'    },
  { value: 'no disponible', label: 'No disponible' },
];

// ─────────────────────────────────────────────
// INICIALIZACIÓN DE FILTROS
// ─────────────────────────────────────────────
function buildFilters() {
  const posSelect   = document.getElementById('filter-position');
  const availSelect = document.getElementById('filter-availability');

  POSITIONS.forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    posSelect.appendChild(opt);
  });

  AVAILABILITIES.forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    availSelect.appendChild(opt);
  });

  posSelect.addEventListener('change', renderPlayers);
  availSelect.addEventListener('change', renderPlayers);
}

// ─────────────────────────────────────────────
// CARGA DESDE GOOGLE SHEETS (CSV)
// ─────────────────────────────────────────────
function parseCSV(text) {
  const [headerLine, ...rows] = text.trim().split('\n');
  const headers = headerLine.split(',').map(h => h.trim().toLowerCase());

  return rows
    .filter(row => row.trim())
    .map(row => {
      // Manejo básico de comas dentro de comillas
      const cols = row.match(/(".*?"|[^,]+)(?=,|$)/g) || [];
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = (cols[i] || '').replace(/^"|"$/g, '').trim();
      });
      return {
        name:         obj['nombre']         || '',
        photo:        obj['foto']           || '',
        position:     obj['posicion']       || '',
        availability: obj['disponibilidad'] || '',
        description:  obj['descripcion']    || '',
        video:        obj['video']          || '',
      };
    })
    .filter(p => p.name);
}

async function loadPlayers() {
  if (!SHEET_CSV_URL) {
    console.info('Sin URL de Google Sheets configurada. Usando jugadores de prueba.');
    return SAMPLE_PLAYERS;
  }

  try {
    const res = await fetch(SHEET_CSV_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const players = parseCSV(text);
    if (!players.length) throw new Error('La hoja está vacía');
    console.info(`${players.length} jugadores cargados desde Google Sheets.`);
    return players;
  } catch (err) {
    console.warn('No se pudo cargar Google Sheets, usando datos de prueba.', err.message);
    return SAMPLE_PLAYERS;
  }
}

// ─────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────
let allPlayers = [];

function getBadgeClass(availability) {
  return availability === 'disponible' ? 'badge-disponible' : 'badge-no-disponible';
}

function renderPlayers() {
  const pos   = document.getElementById('filter-position').value;
  const avail = document.getElementById('filter-availability').value;
  const grid  = document.getElementById('players-grid');

  const filtered = allPlayers.filter(p => {
    const matchPos   = pos   === 'all' || p.position === pos;
    const matchAvail = avail === 'all' || p.availability === avail;
    return matchPos && matchAvail;
  });

  grid.innerHTML = '';

  if (!filtered.length) {
    grid.innerHTML = '<p class="no-results">No se encontraron jugadores con esos filtros.</p>';
    return;
  }

  filtered.forEach(player => {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.innerHTML = `
      <img src="${player.photo}" alt="Foto de ${player.name}" />
      <div class="card-body">
        <h3>${player.name}</h3>
        <div class="badges">
          <span class="badge badge-position">${player.position}</span>
          <span class="badge ${getBadgeClass(player.availability)}">${player.availability}</span>
        </div>
        <p>${player.description}</p>
      </div>
    `;
    card.addEventListener('click', () => openModal(player));
    grid.appendChild(card);
  });
}

// ─────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────
function openModal(player) {
  document.getElementById('modal-photo').src       = player.photo;
  document.getElementById('modal-photo').alt       = `Foto de ${player.name}`;
  document.getElementById('modal-name').textContent = player.name;

  const positionBadge  = document.getElementById('modal-position');
  positionBadge.textContent = player.position;
  positionBadge.className   = 'badge badge-position';

  const availBadge  = document.getElementById('modal-availability');
  availBadge.textContent = player.availability;
  availBadge.className   = `badge ${getBadgeClass(player.availability)}`;

  document.getElementById('modal-description').textContent = player.description;
  document.getElementById('modal-video').href = player.video;

  document.getElementById('modal').classList.remove('hidden');
}

function setupModal() {
  const modal = document.getElementById('modal');
  document.getElementById('modal-close').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
}

// ─────────────────────────────────────────────
// ARRANQUE
// ─────────────────────────────────────────────
async function init() {
  buildFilters();
  setupModal();
  allPlayers = await loadPlayers();
  renderPlayers();
}

init();

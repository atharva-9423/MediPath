import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const outputDir = path.resolve('public/panoramas');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const PANORAMA_NODES = [
  { file: 'entrance.jpg', name: 'MEDICOVER HOSPITAL MAIN ENTRANCE', floor: 'GROUND FLOOR', dept: 'Emergency &amp; Visitor Entry', theme: '#06b6d4', bg1: '#090d16', bg2: '#1e293b' },
  { file: 'lobby.jpg', name: 'RECEPTION &amp; HELP DESK', floor: 'GROUND FLOOR', dept: 'Patient Services', theme: '#6366f1', bg1: '#0b132b', bg2: '#1c2541' },
  { file: 'corridor.jpg', name: 'GROUND FLOOR MAIN CORRIDOR', floor: 'GROUND FLOOR', dept: 'Central Facilities', theme: '#3b82f6', bg1: '#0f172a', bg2: '#1e293b' },
  { file: 'library.jpg', name: '24x7 PHARMACY &amp; MEDICAL STORE', floor: 'GROUND FLOOR', dept: 'Pharmacy', theme: '#10b981', bg1: '#022c22', bg2: '#065f46' },
  { file: 'principal.jpg', name: 'BILLING &amp; INSURANCE DESK', floor: 'GROUND FLOOR', dept: 'Billing &amp; TPA', theme: '#f59e0b', bg1: '#451a03', bg2: '#78350f' },
  { file: 'canteen.jpg', name: 'CAFETERIA &amp; FOOD COURT', floor: 'GROUND FLOOR', dept: 'Food Services', theme: '#ef4444', bg1: '#450a0a', bg2: '#7f1d1d' },
  { file: 'elevator_gf.jpg', name: 'GROUND FLOOR ELEVATOR &amp; STAIRS', floor: 'GROUND FLOOR', dept: 'Vertical Transport', theme: '#8b5cf6', bg1: '#2e1065', bg2: '#4c1d95' },

  { file: 'landing_1f.jpg', name: '1ST FLOOR ELEVATOR &amp; STAIR LANDING', floor: 'FIRST FLOOR', dept: 'Diagnostics Wing', theme: '#06b6d4', bg1: '#083344', bg2: '#155e75' },
  { file: 'cs_lab.jpg', name: 'PATHOLOGY &amp; BLOOD TEST LAB', floor: 'FIRST FLOOR', dept: 'Diagnostics', theme: '#6366f1', bg1: '#1e1b4b', bg2: '#312e81' },
  { file: 'electronics.jpg', name: 'RADIOLOGY, X-RAY &amp; MRI SCAN', floor: 'FIRST FLOOR', dept: 'Imaging', theme: '#10b981', bg1: '#064e3b', bg2: '#047857' },
  { file: 'dept_office_1f.jpg', name: 'OPD CONSULTATION CHAMBERS', floor: 'FIRST FLOOR', dept: 'Doctor Consultation', theme: '#f59e0b', bg1: '#78350f', bg2: '#92400e' },
  { file: 'auditorium.jpg', name: 'PHYSIOTHERAPY &amp; REHAB CENTER', floor: 'FIRST FLOOR', dept: 'Rehabilitation', theme: '#ec4899', bg1: '#500724', bg2: '#831843' },
  { file: 'washroom_1f.jpg', name: '1ST FLOOR RESTROOMS', floor: 'FIRST FLOOR', dept: 'Facility Operations', theme: '#64748b', bg1: '#0f172a', bg2: '#334155' },

  { file: 'landing_2f.jpg', name: '2ND FLOOR ELEVATOR &amp; STAIR LANDING', floor: 'SECOND FLOOR', dept: 'Critical Care Wing', theme: '#a855f7', bg1: '#3b0764', bg2: '#581c87' },
  { file: 'ai_lab.jpg', name: 'ICU &amp; CRITICAL CARE UNIT', floor: 'SECOND FLOOR', dept: 'Critical Care', theme: '#38bdf8', bg1: '#0c4a6e', bg2: '#0284c7' },
  { file: 'robotics.jpg', name: 'OPERATION THEATRE COMPLEX', floor: 'SECOND FLOOR', dept: 'Surgery', theme: '#f43f5e', bg1: '#4c0519', bg2: '#881337' },
  { file: 'conference_2f.jpg', name: 'CONFERENCE &amp; CME HALL', floor: 'SECOND FLOOR', dept: 'Medical Education', theme: '#eab308', bg1: '#713f12', bg2: '#a16207' },
  { file: 'dean_office_2f.jpg', name: 'HOSPITAL DIRECTOR OFFICE', floor: 'SECOND FLOOR', dept: 'Administration', theme: '#a855f7', bg1: '#581c87', bg2: '#7e22ce' }
];

async function generateAllPanoramas() {
  console.log('🖼️ Generating 18 realistic local equirectangular 360 panorama images...');

  for (const item of PANORAMA_NODES) {
    // Generate a 4096x2048 equirectangular canvas — correct 2:1 ratio, doubled resolution
    // Key fix: content is centred in the MIDDLE vertical band (y=600-1400 out of 2048)
    // This ensures the spherical equirectangular mapping doesn't stretch the horizon content
    const svg = `
<svg width="4096" height="2048" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#010409"/>
      <stop offset="25%" stop-color="${item.bg1}"/>
      <stop offset="55%" stop-color="${item.bg2}"/>
      <stop offset="75%" stop-color="${item.bg1}"/>
      <stop offset="100%" stop-color="#010409"/>
    </linearGradient>
    <linearGradient id="glowGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${item.theme}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${item.theme}" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- Full background -->
  <rect width="4096" height="2048" fill="url(#bgGrad)"/>

  <!-- Ceiling area (top 25% = above equator in 360 sphere) -->
  <g stroke="rgba(255,255,255,0.10)" stroke-width="3">
    <line x1="0" y1="460" x2="4096" y2="460"/>
    <line x1="512" y1="300" x2="512" y2="460"/>
    <line x1="1024" y1="300" x2="1024" y2="460"/>
    <line x1="1536" y1="300" x2="1536" y2="460"/>
    <line x1="2048" y1="300" x2="2048" y2="460"/>
    <line x1="2560" y1="300" x2="2560" y2="460"/>
    <line x1="3072" y1="300" x2="3072" y2="460"/>
    <line x1="3584" y1="300" x2="3584" y2="460"/>
  </g>
  <!-- Ceiling light strip glow -->
  <rect x="0" y="460" width="4096" height="50" fill="url(#glowGrad)"/>

  <!-- Wall vertical perspective lines (horizon zone y=460 to y=1440) -->
  <g stroke="rgba(255,255,255,0.07)" stroke-width="2">
    <line x1="512" y1="510" x2="512" y2="1440"/>
    <line x1="1024" y1="510" x2="1024" y2="1440"/>
    <line x1="1536" y1="510" x2="1536" y2="1440"/>
    <line x1="2048" y1="510" x2="2048" y2="1440"/>
    <line x1="2560" y1="510" x2="2560" y2="1440"/>
    <line x1="3072" y1="510" x2="3072" y2="1440"/>
    <line x1="3584" y1="510" x2="3584" y2="1440"/>
  </g>

  <!-- Glowing dado rail at ~55% height (eye level / horizon) -->
  <rect x="0" y="1050" width="4096" height="12" fill="${item.theme}"/>

  <!-- Floor perspective lines (bottom 30% = below equator) -->
  <g stroke="rgba(255,255,255,0.10)" stroke-width="2">
    <line x1="0" y1="1440" x2="4096" y2="1440"/>
    <line x1="0" y1="1560" x2="4096" y2="1560"/>
    <line x1="0" y1="1700" x2="4096" y2="1700"/>
    <line x1="0" y1="1860" x2="4096" y2="1860"/>
  </g>
  <!-- Floor tile vertical lines -->
  <g stroke="rgba(255,255,255,0.07)" stroke-width="1.5">
    <line x1="512" y1="1440" x2="512" y2="2048"/>
    <line x1="1024" y1="1440" x2="1024" y2="2048"/>
    <line x1="1536" y1="1440" x2="1536" y2="2048"/>
    <line x1="2048" y1="1440" x2="2048" y2="2048"/>
    <line x1="2560" y1="1440" x2="2560" y2="2048"/>
    <line x1="3072" y1="1440" x2="3072" y2="2048"/>
    <line x1="3584" y1="1440" x2="3584" y2="2048"/>
  </g>

  <!-- Signboard centred at horizon (y=900 = slightly above eye level) -->
  <g transform="translate(2048, 900)">
    <rect x="-500" y="-100" width="1000" height="210" rx="28" fill="rgba(10, 15, 30, 0.95)" stroke="${item.theme}" stroke-width="5"/>
    <text x="0" y="-30" font-family="Outfit, sans-serif" font-weight="800" font-size="56" fill="#ffffff" text-anchor="middle">${item.name}</text>
    <text x="0" y="40" font-family="Inter, sans-serif" font-weight="700" font-size="36" fill="${item.theme}" text-anchor="middle">MAIN ACADEMIC BUILDING • ${item.floor}</text>
    <text x="0" y="90" font-family="Inter, sans-serif" font-size="28" fill="#94a3b8" text-anchor="middle">${item.dept}</text>
  </g>

  <!-- Cardinal direction labels at horizon line -->
  <text x="2048" y="1400" font-family="Inter, sans-serif" font-weight="bold" font-size="28" fill="rgba(255,255,255,0.45)" text-anchor="middle">▲ NORTH [0°]</text>
  <text x="3072" y="1400" font-family="Inter, sans-serif" font-weight="bold" font-size="28" fill="rgba(255,255,255,0.45)" text-anchor="middle">▲ EAST [90°]</text>
  <text x="1024" y="1400" font-family="Inter, sans-serif" font-weight="bold" font-size="28" fill="rgba(255,255,255,0.45)" text-anchor="middle">▲ WEST [270°]</text>
  <text x="4" y="1400" font-family="Inter, sans-serif" font-weight="bold" font-size="28" fill="rgba(255,255,255,0.45)" text-anchor="start">▲ SOUTH [180°]</text>
</svg>`;

    const destPath = path.join(outputDir, item.file);
    await sharp(Buffer.from(svg))
      .jpeg({ quality: 90 })
      .toFile(destPath);

    console.log(`  ✓ Created: public/panoramas/${item.file}`);
  }

  console.log('✅ All 18 local 360 panorama images generated successfully!');
}

generateAllPanoramas().catch(console.error);

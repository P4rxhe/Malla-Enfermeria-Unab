import React, { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import {
  CheckCircle2,
  Lock,
  Unlock,
  RotateCcw,
  Star,
  Link as LinkIcon,
  HelpCircle,
  Sparkles,
  Search,
  X,
  Info,
  ZoomIn,
  ZoomOut,
  Maximize2
} from 'lucide-react';
import mallaData from './data/mallaEnfermeria.json';

const STORAGE_KEY = 'malla_enfermeria_unab_aprobados_v3';

export default function App() {
  const [approved, setApproved] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [hoveredCourseId, setHoveredCourseId] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [highlightClinics, setHighlightClinics] = useState(false);
  const [search, setSearch] = useState('');
  const [showModalInfo, setShowModalInfo] = useState(false);
  const [showFastApproveModal, setShowFastApproveModal] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(88); // Zoom inicial compacto para ver toda la malla

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(approved));
    } catch (e) {
      console.error('Error guardando progreso', e);
    }
  }, [approved]);

  // Mapa rápido de ramos
  const courseMap = useMemo(() => {
    const map = new Map();
    mallaData.ramos.forEach(r => map.set(r.id, r));
    return map;
  }, []);

  const totalCreditos = mallaData.totalCreditos;
  const totalRamos = mallaData.ramos.length;

  const creditosAprobados = useMemo(() => {
    return approved.reduce((sum, id) => {
      const c = courseMap.get(id);
      return sum + (c?.creditos || 0);
    }, 0);
  }, [approved, courseMap]);

  const porcentajeCreditos = Math.round((creditosAprobados / totalCreditos) * 100);
  const porcentajeRamos = Math.round((approved.length / totalRamos) * 100);

  // Confeti al completar
  useEffect(() => {
    if (approved.length === totalRamos && totalRamos > 0) {
      confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 } });
    }
  }, [approved.length, totalRamos]);

  // Dependencias directas
  const directDependents = useMemo(() => {
    const deps = new Map();
    mallaData.ramos.forEach(r => {
      r.prerrequisitos.forEach(p => {
        if (!deps.has(p)) deps.set(p, []);
        deps.get(p).push(r.id);
      });
    });
    return deps;
  }, []);

  const isUnlocked = (course) => {
    if (!course.prerrequisitos || course.prerrequisitos.length === 0) return true;
    return course.prerrequisitos.every(reqId => approved.includes(reqId));
  };

  const getAllAncestors = (courseId) => {
    const ancestors = new Set();
    const stack = [courseId];
    while (stack.length > 0) {
      const curr = stack.pop();
      const course = courseMap.get(curr);
      if (course && course.prerrequisitos) {
        for (const req of course.prerrequisitos) {
          if (!ancestors.has(req)) {
            ancestors.add(req);
            stack.push(req);
          }
        }
      }
    }
    return Array.from(ancestors);
  };

  const getAllDescendants = (courseId) => {
    const descendants = new Set();
    const stack = [courseId];
    while (stack.length > 0) {
      const current = stack.pop();
      const nexts = directDependents.get(current) || [];
      for (const n of nexts) {
        if (!descendants.has(n)) {
          descendants.add(n);
          stack.push(n);
        }
      }
    }
    return Array.from(descendants);
  };

  const handleToggleCourse = (course) => {
    const isApp = approved.includes(course.id);
    if (isApp) {
      const dependentIds = getAllDescendants(course.id);
      const toRemove = [course.id, ...dependentIds.filter(id => approved.includes(id))];
      setApproved(prev => prev.filter(id => !toRemove.includes(id)));
    } else {
      const missingAncestors = getAllAncestors(course.id).filter(id => !approved.includes(id));
      const toAdd = [course.id, ...missingAncestors];
      if (course.correquisitos && course.correquisitos.length > 0) {
        course.correquisitos.forEach(coId => {
          if (!approved.includes(coId) && !toAdd.includes(coId)) {
            toAdd.push(coId);
          }
        });
      }
      setApproved(prev => [...new Set([...prev, ...toAdd])]);
    }
  };

  const handleClear = () => {
    if (window.confirm('¿Reiniciar todos los ramos aprobados de la malla?')) {
      setApproved([]);
    }
  };

  const handleApproveUntilSemester = (targetSemester) => {
    const targetCourses = mallaData.ramos
      .filter(r => r.semestre <= targetSemester)
      .map(r => r.id);
    setApproved(prev => [...new Set([...prev, ...targetCourses])]);
    setShowFastApproveModal(false);
  };

  // Conjuntos de relaciones para hover ultra rápido (0ms latency, 60fps)
  const hoverData = useMemo(() => {
    if (!hoveredCourseId) return null;
    const current = courseMap.get(hoveredCourseId);
    if (!current) return null;

    return {
      activeId: hoveredCourseId,
      prereqs: new Set(current.prerrequisitos || []),
      coreqs: new Set(current.correquisitos || []),
      unlocks: new Set(directDependents.get(hoveredCourseId) || [])
    };
  }, [hoveredCourseId, courseMap, directDependents]);

  // Estructura de semestres (1 a 10)
  const semestersData = useMemo(() => {
    const semArray = [];
    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

    for (let sem = 1; sem <= 10; sem++) {
      const allSemCourses = mallaData.ramos.filter(r => r.semestre === sem);
      const troncales = allSemCourses.filter(r => r.tipo === 'troncal');
      const transversales = allSemCourses.filter(r => r.tipo === 'transversal' || r.tipo === 'idioma');
      const totalCreds = allSemCourses.reduce((sum, c) => sum + c.creditos, 0);

      semArray.push({
        num: sem,
        roman: romanNumerals[sem - 1],
        ano: Math.ceil(sem / 2),
        totalCreds,
        troncales,
        transversales
      });
    }
    return semArray;
  }, []);

  // Componente de Tarjeta individual de Ramo (estilo malla-fic pero con colores de Enfermería UNAB)
  const CourseCard = ({ course }) => {
    const isApp = approved.includes(course.id);
    const unlocked = isUnlocked(course);
    const isHovered = hoverData?.activeId === course.id;
    const isPrereq = hoverData?.prereqs.has(course.id);
    const isCoreq = hoverData?.coreqs.has(course.id);
    const isUnlockTarget = hoverData?.unlocks.has(course.id);

    // Búsqueda
    const matchesSearch = search.trim() === '' || 
      course.codigo.toLowerCase().includes(search.toLowerCase()) || 
      course.nombre.toLowerCase().includes(search.toLowerCase());

    // Highlight campos clínicos
    const isClinicalHighlight = highlightClinics && course.campoClinico;
    const isDimmedByClinical = highlightClinics && !course.campoClinico;

    // Config de categoría
    const cat = mallaData.categorias.find(c => c.id === course.categoria);

    // Estado visual dinámico
    let ringClass = 'border border-zinc-700/80';
    let bgClass = cat?.bgCard || 'bg-zinc-900 border-zinc-700 text-white';
    let opacityClass = 'opacity-100';

    if (isHovered) {
      ringClass = 'ring-2 ring-white scale-[1.03] shadow-2xl z-20 brightness-125';
    } else if (isPrereq) {
      ringClass = 'ring-2 ring-emerald-400 bg-emerald-950/90 border-emerald-400 scale-[1.02] shadow-lg shadow-emerald-500/30 z-10';
    } else if (isCoreq) {
      ringClass = 'ring-2 ring-rose-500 border-dashed border-rose-500 bg-rose-950/90 scale-[1.02] shadow-lg shadow-rose-500/30 z-10';
    } else if (isUnlockTarget) {
      ringClass = 'ring-2 ring-purple-400 bg-purple-950/90 border-purple-400 scale-[1.02] shadow-lg shadow-purple-500/30 z-10';
    } else if (isClinicalHighlight) {
      ringClass = 'ring-2 ring-amber-400 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.6)] z-10 brightness-110';
    }

    if (isApp) {
      bgClass = 'bg-[#18181b]/90 border-zinc-800 text-zinc-400';
      opacityClass = 'opacity-55 hover:opacity-90';
    } else if (!unlocked) {
      bgClass = 'bg-[#09090b]/80 border-zinc-800/80 text-zinc-500';
      opacityClass = 'opacity-65 hover:opacity-85';
    }

    if (!matchesSearch || isDimmedByClinical) {
      opacityClass = 'opacity-20 pointer-events-none';
    }

    return (
      <div
        onClick={() => handleToggleCourse(course)}
        onMouseEnter={() => setHoveredCourseId(course.id)}
        onMouseLeave={() => setHoveredCourseId(null)}
        className={`
          relative w-[122px] h-[78px] rounded-lg p-1.5 flex flex-col justify-between cursor-pointer transition-all duration-100 select-none
          ${bgClass}
          ${ringClass}
          ${opacityClass}
        `}
      >
        {/* Cabecera de la tarjeta: Código + Estrella / Co-requisito */}
        <div className="flex items-center justify-between text-[10px] leading-none mb-0.5">
          <span className="font-mono font-black text-white/90 tracking-tight">
            {course.codigo}
          </span>

          <div className="flex items-center gap-1">
            {/* Estrella de Campo Clínico */}
            {course.campoClinico && (
              <span title="Campo Clínico Obligatorio" className="text-amber-400">
                <Star className="w-3 h-3 fill-amber-400" />
              </span>
            )}

            {/* Co-requisito Ligado */}
            {course.correquisitos && course.correquisitos.length > 0 && (
              <span title={`Co-requisito ligado con: ${course.correquisitos.join(', ')}`} className="text-rose-400">
                <LinkIcon className="w-3 h-3" />
              </span>
            )}
          </div>
        </div>

        {/* Nombre del Ramo (Blanco, claro, centrado) */}
        <div className={`text-[10.5px] font-bold text-center leading-[1.15] line-clamp-3 my-auto ${isApp ? 'line-through text-zinc-400' : 'text-white'}`}>
          {course.nombre}
        </div>

        {/* Pie de tarjeta: Indicadores de prerrequisito (círculos) + Créditos */}
        <div className="flex items-center justify-between text-[9px] pt-0.5 border-t border-white/10 mt-0.5">
          {/* Círculos de prerrequisitos */}
          <div className="flex items-center gap-0.5" title={`Prerrequisitos: ${course.prerrequisitos.join(', ') || 'Ninguno'}`}>
            {course.prerrequisitos.length === 0 ? (
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600/50" />
            ) : (
              course.prerrequisitos.map(reqId => (
                <span
                  key={reqId}
                  className={`w-1.5 h-1.5 rounded-full ${
                    approved.includes(reqId) ? 'bg-emerald-400' : 'bg-red-400'
                  }`}
                />
              ))
            )}
          </div>

          {/* Créditos */}
          <span className="font-mono font-bold text-white/80 bg-black/40 px-1 py-0.2 rounded text-[8.5px]">
            {course.creditos}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#070707] text-white flex flex-col font-sans select-none pb-36">

      {/* ================= BARRA SUPERIOR ================= */}
      <header className="sticky top-0 z-40 bg-[#0c0c0e]/95 backdrop-blur-md border-b border-zinc-800 px-4 py-2.5 shadow-xl">
        <div className="max-w-[1920px] mx-auto flex flex-wrap items-center justify-between gap-3">

          {/* Título */}
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🩺</span>
            <div>
              <h1 className="text-base md:text-lg font-black tracking-tight text-white flex items-center gap-2">
                Malla Interactiva Enfermería UNAB
              </h1>
              <p className="text-[11px] text-zinc-400 hidden sm:block">
                10 Semestres • Árbol de Requisitos, Co-requisitos Ligados y Campos Clínicos
              </p>
            </div>
          </div>

          {/* Barra de Controles: Buscador, Zoom, Campos Clínicos, Simbología */}
          <div className="flex items-center flex-wrap gap-2">

            {/* Buscador */}
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar ramo..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-zinc-900 border border-zinc-700/80 rounded-lg pl-7 pr-3 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 w-36 md:w-48"
              />
              <Search className="w-3 h-3 text-zinc-400 absolute left-2 top-2" />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1.5 text-zinc-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Control de Zoom (+ / -) */}
            <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-lg px-1 py-0.5 text-xs text-zinc-300">
              <button
                onClick={() => setZoomLevel(prev => Math.max(70, prev - 7))}
                className="p-1 hover:text-white transition"
                title="Alejar vista (Zoom -)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-1.5 font-mono text-[11px] font-bold text-zinc-200">
                {zoomLevel}%
              </span>
              <button
                onClick={() => setZoomLevel(prev => Math.min(115, prev + 7))}
                className="p-1 hover:text-white transition"
                title="Acercar vista (Zoom +)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Botón Resaltar Campos Clínicos (con brillo, sin ocultar los demás) */}
            <button
              onClick={() => setHighlightClinics(!highlightClinics)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition ${
                highlightClinics
                  ? 'bg-amber-500/30 text-amber-300 border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.4)]'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800'
              }`}
            >
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>Solo Campos Clínicos</span>
            </button>

            {/* Aprobación Rápida */}
            <button
              onClick={() => setShowFastApproveModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 transition"
              title="Aprobar hasta semestre X"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden md:inline">Aprobar Semestre</span>
            </button>

            {/* Simbología */}
            <button
              onClick={() => setShowModalInfo(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 transition"
            >
              <HelpCircle className="w-3.5 h-3.5 text-pink-400" />
              <span>Simbología</span>
            </button>
          </div>
        </div>
      </header>

      {/* ================= TABLA LIMPIA ESTILO MALLA-FIC ================= */}
      <main className="flex-1 overflow-x-auto overflow-y-visible px-4 py-4 flex justify-center">
        <div
          className="inline-block transition-transform duration-150 origin-top"
          style={{ transform: `scale(${zoomLevel / 100})` }}
        >
          {/* Cabecera de Años (Año 1, Año 2, Año 3, Año 4, Año 5) */}
          <div className="grid grid-cols-10 gap-2 mb-1.5 text-center">
            <div className="col-span-2 bg-zinc-800/90 border border-zinc-700 py-1 rounded text-xs font-black tracking-wider text-zinc-200">
              Año 1
            </div>
            <div className="col-span-2 bg-zinc-800/90 border border-zinc-700 py-1 rounded text-xs font-black tracking-wider text-zinc-200">
              Año 2
            </div>
            <div className="col-span-2 bg-zinc-800/90 border border-zinc-700 py-1 rounded text-xs font-black tracking-wider text-zinc-200">
              Año 3
            </div>
            <div className="col-span-2 bg-zinc-800/90 border border-zinc-700 py-1 rounded text-xs font-black tracking-wider text-zinc-200">
              Año 4
            </div>
            <div className="col-span-2 bg-zinc-800/90 border border-zinc-700 py-1 rounded text-xs font-black tracking-wider text-zinc-200">
              Año 5
            </div>
          </div>

          {/* Cabecera de Semestres (I, II, III, IV, V, VI, VII, VIII, IX, X) */}
          <div className="grid grid-cols-10 gap-2 mb-3 text-center">
            {semestersData.map(sem => (
              <div
                key={sem.num}
                className="bg-zinc-900/90 border border-zinc-800 py-0.5 rounded text-[11px] font-mono font-bold text-zinc-300"
              >
                {sem.roman}
              </div>
            ))}
          </div>

          {/* PARTE SUPERIOR: RAMOS TRONCALES / DISCIPLINARES */}
          <div className="grid grid-cols-10 gap-2 items-start">
            {semestersData.map(sem => (
              <div key={sem.num} className="flex flex-col gap-2 min-h-[380px]">
                {sem.troncales.map(course => (
                  <CourseCard key={course.id} course={course} />
                ))}
              </div>
            ))}
          </div>

          {/* SEPARADOR VISUAL ELEGANTE */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px bg-zinc-800 flex-1" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Cursos Transversales & Idiomas
            </span>
            <div className="h-px bg-zinc-800 flex-1" />
          </div>

          {/* PARTE INFERIOR: RAMOS TRANSVERSALES E INGLÉS (SECCIÓN AJENA ABAJO) */}
          <div className="grid grid-cols-10 gap-2 items-start">
            {semestersData.map(sem => (
              <div key={sem.num} className="flex flex-col gap-2">
                {sem.transversales.map(course => (
                  <CourseCard key={course.id} course={course} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ================= BARRA INFERIOR DE LEYENDA Y MÉTRICAS ================= */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 bg-[#0a0a0c]/98 backdrop-blur-md border-t border-zinc-800 p-3 shadow-2xl">
        <div className="max-w-[1920px] mx-auto flex flex-col md:flex-row items-center justify-between gap-3 px-2">

          {/* Leyenda de Colores de Secciones */}
          <div className="flex items-center gap-2 overflow-x-auto text-[11px] text-zinc-300 max-w-full">
            {mallaData.categorias.map(cat => (
              <div
                key={cat.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 whitespace-nowrap"
                title={cat.descripcion}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cat.colorHex }}
                />
                <span className="font-semibold text-zinc-200">{cat.nombre}</span>
              </div>
            ))}
          </div>

          {/* Estadísticas de Avance */}
          <div className="flex items-center gap-5 justify-between w-full md:w-auto">
            {/* Barra de Progreso */}
            <div className="flex flex-col gap-0.5 w-40 md:w-52">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-zinc-300">
                  Créditos: <span className="text-pink-400">{creditosAprobados}</span>/{totalCreditos}
                </span>
                <span className="text-pink-400">{porcentajeCreditos}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden border border-zinc-700/50">
                <div
                  className="h-full bg-gradient-to-r from-pink-500 via-blue-500 to-emerald-400 transition-all duration-300"
                  style={{ width: `${porcentajeCreditos}%` }}
                />
              </div>
            </div>

            {/* Contador de Ramos */}
            <div className="text-right whitespace-nowrap">
              <div className="text-[10px] text-zinc-400">Total Ramos</div>
              <div className="text-xs font-black text-white">
                {approved.length} / {totalRamos} ({porcentajeRamos}%)
              </div>
            </div>

            {/* Botón Limpiar */}
            <button
              onClick={handleClear}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition whitespace-nowrap"
              title="Reiniciar todos los ramos aprobados"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpiar ramos</span>
            </button>
          </div>
        </div>
      </footer>

      {/* ================= MODAL DE SIMBOLOGÍA ================= */}
      {showModalInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-700 max-w-lg w-full rounded-2xl p-6 shadow-2xl relative text-left">
            <button
              onClick={() => setShowModalInfo(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-pink-400" />
              Simbología y Reglas de la Malla ENF UNAB
            </h3>

            <div className="space-y-3 text-xs mt-3">
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex gap-3 items-start">
                <div className="w-3 h-3 rounded-full bg-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-white">Prerrequisitos previos</h4>
                  <p className="text-zinc-400 text-[11px] mt-0.5">
                    Al pasar el cursor sobre cualquier ramo, sus <strong>prerrequisitos obligatorios se iluminan en verde</strong>.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-500/50 flex gap-3 items-start">
                <div className="w-3 h-3 rounded-full bg-purple-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-purple-300">Ramos que desbloquea</h4>
                  <p className="text-zinc-300 text-[11px] mt-0.5">
                    Al pasar el cursor sobre un ramo, los <strong>ramos futuros que desbloquearás se iluminan en morado</strong>.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/50 flex gap-3 items-start">
                <LinkIcon className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-rose-300">Co-requisitos Ligados (Línea roja punteada del PDF)</h4>
                  <p className="text-zinc-300 text-[11px] mt-0.5">
                    Deben ser tomados <strong>al mismo tiempo de manera obligatoria</strong> (no se puede tomar solo uno). Se iluminan con borde punteado rojo.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/50 flex gap-3 items-start">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-300">Estrella en esquina superior derecha</h4>
                  <p className="text-zinc-300 text-[11px] mt-0.5">
                    Indica que el ramo posee componente de <strong>campo clínico obligatorio</strong>.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowModalInfo(false)}
              className="mt-5 w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* ================= MODAL DE APROBACIÓN RÁPIDA ================= */}
      {showFastApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-700 max-w-md w-full rounded-2xl p-6 shadow-2xl relative text-left">
            <button
              onClick={() => setShowFastApproveModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              Aprobación Rápida de Semestres
            </h3>
            <p className="text-xs text-zinc-400 mb-4">
              Marca todos los ramos aprobados hasta el semestre que elijas con 1 clic:
            </p>

            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
              {semestersData.map(sem => (
                <button
                  key={sem.num}
                  onClick={() => handleApproveUntilSemester(sem.num)}
                  className="p-2.5 rounded-xl bg-zinc-950 hover:bg-blue-600 hover:text-white border border-zinc-800 text-xs font-bold text-zinc-200 transition text-left flex items-center justify-between"
                >
                  <span>Hasta Semestre {sem.roman}</span>
                  <span className="text-[10px] text-zinc-400">Año {sem.ano}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowFastApproveModal(false)}
              className="mt-4 w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
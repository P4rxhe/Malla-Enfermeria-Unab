import React, { useState, useEffect, useMemo, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  RotateCcw,
  Star,
  Link as LinkIcon,
  HelpCircle,
  Sparkles,
  Search,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import mallaData from './data/mallaEnfermeria.json';

const STORAGE_KEY = 'malla_enfermeria_unab_aprobados_v4';

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
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [highlightClinics, setHighlightClinics] = useState(false);
  const [search, setSearch] = useState('');
  const [showModalInfo, setShowModalInfo] = useState(false);
  const [showFastApproveModal, setShowFastApproveModal] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(88);

  const containerRef = useRef(null);
  const cardElementsRef = useRef(new Map());

  // Guardar en localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(approved));
    } catch (e) {
      console.error(e);
    }
  }, [approved]);

  // Mapa rápido de ramos por ID y por Número
  const { courseMap, numberMap } = useMemo(() => {
    const byId = new Map();
    const byNum = new Map();
    mallaData.ramos.forEach(r => {
      byId.set(r.id, r);
      byNum.set(r.numero, r);
    });
    return { courseMap: byId, numberMap: byNum };
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

  // Confeti al 100%
  useEffect(() => {
    if (approved.length === totalRamos && totalRamos > 0) {
      confetti({ particleCount: 160, spread: 100, origin: { y: 0.6 } });
    }
  }, [approved.length, totalRamos]);

  // Dependencias directas (ramos que abre)
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
      // Desmarcar en cascada los que dependen de él
      const dependentIds = getAllDescendants(course.id);
      const toRemove = [course.id, ...dependentIds.filter(id => approved.includes(id))];
      setApproved(prev => prev.filter(id => !toRemove.includes(id)));
    } else {
      // Marcar ramo + auto-marcar prerrequisitos necesarios
      const missingAncestors = getAllAncestors(course.id).filter(id => !approved.includes(id));
      const toAdd = [course.id, ...missingAncestors];
      // Si tiene co-requisitos ligados (línea roja punteada)
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

  // Datos del ramo hovered
  const hoveredInfo = useMemo(() => {
    if (!hoveredCourseId) return null;
    const current = courseMap.get(hoveredCourseId);
    if (!current) return null;

    const prereqs = new Set(current.prerrequisitos || []);
    const coreqs = new Set(current.correquisitos || []);
    const unlocks = new Set(directDependents.get(hoveredCourseId) || []);

    return { course: current, prereqs, coreqs, unlocks };
  }, [hoveredCourseId, courseMap, directDependents]);

  // Flechas SVG dinámicas calculadas solo para el ramo activo en hover
  const activeArrows = useMemo(() => {
    if (!hoveredInfo || !containerRef.current) return [];
    const { course, prereqs, coreqs, unlocks } = hoveredInfo;
    const activeEl = cardElementsRef.current.get(course.id);
    if (!activeEl) return [];

    const containerRect = containerRef.current.getBoundingClientRect();
    const aRect = activeEl.getBoundingClientRect();

    const activeBox = {
      left: aRect.left - containerRect.left,
      right: aRect.right - containerRect.left,
      top: aRect.top - containerRect.top,
      bottom: aRect.bottom - containerRect.top,
      centerX: aRect.left - containerRect.left + aRect.width / 2,
      centerY: aRect.top - containerRect.top + aRect.height / 2
    };

    const arrows = [];

    // 1. Flechas NARANJAS desde los Prerrequisitos hacia el ramo activo
    prereqs.forEach(prereqId => {
      const el = cardElementsRef.current.get(prereqId);
      if (el) {
        const r = el.getBoundingClientRect();
        arrows.push({
          id: `pre-${prereqId}-${course.id}`,
          from: { x: r.right - containerRect.left, y: r.top - containerRect.top + r.height / 2 },
          to: { x: activeBox.left, y: activeBox.centerY },
          color: '#f97316', // Naranja como en la captura
          strokeWidth: 3,
          dashed: false
        });
      }
    });

    // 2. Flechas AZULES desde el ramo activo hacia los que ABRE
    unlocks.forEach(unlockId => {
      const el = cardElementsRef.current.get(unlockId);
      if (el) {
        const r = el.getBoundingClientRect();
        arrows.push({
          id: `unl-${course.id}-${unlockId}`,
          from: { x: activeBox.right, y: activeBox.centerY },
          to: { x: r.left - containerRect.left, y: r.top - containerRect.top + r.height / 2 },
          color: '#38bdf8', // Azul celeste como en la captura
          strokeWidth: 3,
          dashed: true
        });
      }
    });

    // 3. Flechas ROJAS hacia los Co-requisitos ligados
    coreqs.forEach(coId => {
      const el = cardElementsRef.current.get(coId);
      if (el) {
        const r = el.getBoundingClientRect();
        arrows.push({
          id: `co-${course.id}-${coId}`,
          from: { x: activeBox.centerX, y: activeBox.bottom },
          to: { x: r.left - containerRect.left + r.width / 2, y: r.top - containerRect.top },
          color: '#ef4444', // Rojo punteado
          strokeWidth: 3,
          dashed: true
        });
      }
    });

    return arrows;
  }, [hoveredInfo]);

  // Estructura de semestres (1 a 10)
  const semestersData = useMemo(() => {
    const semArray = [];
    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

    for (let sem = 1; sem <= 10; sem++) {
      const allCourses = mallaData.ramos.filter(r => r.semestre === sem);
      const troncales = allCourses.filter(r => r.tipo === 'troncal');
      const transversales = allCourses.filter(r => r.tipo === 'transversal' || r.tipo === 'idioma');
      const totalCreds = allCourses.reduce((sum, c) => sum + c.creditos, 0);

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

  // Componente de Tarjeta con diseño idéntico a las capturas
  const CourseCard = ({ course }) => {
    const isApp = approved.includes(course.id);
    const unlocked = isUnlocked(course);
    const isHovered = hoveredInfo?.course.id === course.id;
    const isPrereq = hoveredInfo?.prereqs.has(course.id);
    const isCoreq = hoveredInfo?.coreqs.has(course.id);
    const isUnlockTarget = hoveredInfo?.unlocks.has(course.id);

    const isClinicalHighlight = highlightClinics && course.campoClinico;
    const isDimmedByClinical = highlightClinics && !course.campoClinico;

    // Resaltado de bordes
    let ringStyle = 'border border-zinc-800';
    if (isHovered) {
      ringStyle = 'ring-2 ring-white scale-[1.04] shadow-2xl z-30 brightness-110';
    } else if (isPrereq) {
      ringStyle = 'ring-3 ring-orange-500 scale-[1.02] shadow-lg shadow-orange-500/40 z-20';
    } else if (isUnlockTarget) {
      ringStyle = 'ring-3 ring-cyan-400 scale-[1.02] shadow-lg shadow-cyan-500/40 z-20';
    } else if (isCoreq) {
      ringStyle = 'ring-3 ring-red-500 border-dashed scale-[1.02] shadow-lg shadow-red-500/40 z-20';
    } else if (isClinicalHighlight) {
      ringStyle = 'ring-2 ring-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.7)] z-10 brightness-115';
    }

    let opacityStyle = 'opacity-100';
    if (!unlocked && !isApp) {
      opacityStyle = 'opacity-60 hover:opacity-85';
    }
    if (isDimmedByClinical) {
      opacityStyle = 'opacity-25 pointer-events-none';
    }

    return (
      <div
        ref={el => {
          if (el) cardElementsRef.current.set(course.id, el);
          else cardElementsRef.current.delete(course.id);
        }}
        onClick={() => handleToggleCourse(course)}
        onMouseEnter={(e) => {
          setHoveredCourseId(course.id);
          setMousePos({ x: e.clientX, y: e.clientY });
        }}
        onMouseMove={(e) => {
          setMousePos({ x: e.clientX, y: e.clientY });
        }}
        onMouseLeave={() => setHoveredCourseId(null)}
        className={`
          relative w-[124px] h-[78px] rounded flex flex-col justify-between cursor-pointer transition-all duration-75 select-none overflow-hidden
          ${ringStyle}
          ${opacityStyle}
        `}
        style={{
          boxShadow: isHovered ? '0 10px 25px rgba(0,0,0,0.8)' : '0 2px 5px rgba(0,0,0,0.4)'
        }}
      >
        {/* ================= BARRA SUPERIOR (CÓDIGO + NÚMERO DE SERIE EN CÍRCULO BLANCO) ================= */}
        <div className="bg-[#121214] px-1.5 py-0.5 flex items-center justify-between border-b border-black/30">
          <span className="font-mono text-[10px] font-black text-white tracking-tight">
            {course.codigo}
          </span>

          <div className="flex items-center gap-1">
            {/* Estrella de Campo Clínico */}
            {course.campoClinico && (
              <span title="Campo Clínico Obligatorio" className="text-amber-400">
                <Star className="w-2.5 h-2.5 fill-amber-400" />
              </span>
            )}

            {/* Número de serie correlativo del ramo (en círculo blanco) */}
            <span
              className="w-4 h-4 rounded-full bg-white text-black font-black text-[9px] flex items-center justify-center shadow-sm"
              title={`Número de ramo: ${course.numero}`}
            >
              {course.numero}
            </span>
          </div>
        </div>

        {/* ================= CUERPO CENTRAL (COLOR PROPIO DEL RAMO + NOMBRE) ================= */}
        <div
          className="flex-1 px-1 flex items-center justify-center relative overflow-hidden"
          style={{ backgroundColor: course.color }}
        >
          <div
            className="text-[10px] font-bold text-center leading-[1.15] line-clamp-3 z-10"
            style={{ color: course.textColor || '#ffffff' }}
          >
            {course.nombre}
          </div>

          {/* ================= FRANJA ROJA DIAGONAL AL CLIQUEAR (RAMO APROBADO) ================= */}
          {isApp && (
            <div className="absolute inset-0 pointer-events-none z-20">
              <svg className="w-full h-full">
                <line
                  x1="0"
                  y1="0"
                  x2="100%"
                  y2="100%"
                  stroke="#dc2626"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          )}

          {/* Sombra de aprobado */}
          {isApp && <div className="absolute inset-0 bg-black/40 z-10" />}
        </div>

        {/* ================= BARRA INFERIOR (DEPENDENCIAS / NÚMEROS + CRÉDITOS) ================= */}
        <div className="bg-[#121214] px-1.5 py-0.5 flex items-center justify-between border-t border-black/30">
          {/* Círculos con los números de las dependencias */}
          <div className="flex items-center gap-1 min-w-0" title={`Depende de los ramos N°: ${course.prerrequisitosNumeros.join(', ') || 'Ninguno'}`}>
            {course.prerrequisitosNumeros.length === 0 ? (
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-700/60" />
            ) : (
              course.prerrequisitosNumeros.map(num => {
                const reqCourse = numberMap.get(num);
                const reqApp = reqCourse ? approved.includes(reqCourse.id) : false;
                return (
                  <span
                    key={num}
                    className={`w-3.5 h-3.5 rounded-full text-[8px] font-black flex items-center justify-center border ${
                      reqApp
                        ? 'bg-emerald-400 text-black border-emerald-300'
                        : 'bg-[#0284c7] text-white border-sky-300'
                    }`}
                  >
                    {num}
                  </span>
                );
              })
            )}
          </div>

          {/* Créditos en cajita gris */}
          <span className="font-mono text-[8.5px] font-bold text-zinc-300 bg-zinc-800 px-1 py-0.2 rounded border border-zinc-700">
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
                Colores oficiales, números de serie correlativos, dependencias y franja de aprobado
              </p>
            </div>
          </div>

          {/* Barra de Controles: Buscador, Zoom, Campos Clínicos, Simbología */}
          <div className="flex items-center flex-wrap gap-2">

            {/* Buscador */}
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar ramo o código..."
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

            {/* Botón Resaltar Campos Clínicos (con brillo, sin ocultar) */}
            <button
              onClick={() => setHighlightClinics(!highlightClinics)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition ${
                highlightClinics
                  ? 'bg-amber-500/30 text-amber-300 border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.5)]'
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

      {/* ================= CONTENEDOR PRINCIPAL CON FLECHAS SVG Y GRID ================= */}
      <main className="flex-1 overflow-x-auto overflow-y-visible px-4 py-4 flex justify-center">
        <div
          ref={containerRef}
          className="relative inline-block transition-transform duration-100 origin-top"
          style={{ transform: `scale(${zoomLevel / 100})` }}
        >
          {/* ================= CAPA DE FLECHAS SVG DINÁMICAS (AL PASAR EL CURSOR) ================= */}
          <svg
            className="absolute inset-0 pointer-events-none z-30 w-full h-full"
            style={{ minWidth: '100%', minHeight: '100%' }}
          >
            <defs>
              <marker
                id="arrow-orange"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="4"
                orient="auto"
              >
                <polygon points="0 0, 8 4, 0 8" fill="#f97316" />
              </marker>
              <marker
                id="arrow-cyan"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="4"
                orient="auto"
              >
                <polygon points="0 0, 8 4, 0 8" fill="#38bdf8" />
              </marker>
              <marker
                id="arrow-red"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="4"
                orient="auto"
              >
                <polygon points="0 0, 8 4, 0 8" fill="#ef4444" />
              </marker>
            </defs>

            {activeArrows.map(arrow => {
              const dx = arrow.to.x - arrow.from.x;
              const control1 = { x: arrow.from.x + dx * 0.45, y: arrow.from.y };
              const control2 = { x: arrow.to.x - dx * 0.45, y: arrow.to.y };
              const d = `M ${arrow.from.x} ${arrow.from.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${arrow.to.x} ${arrow.to.y}`;

              let markerUrl = 'url(#arrow-cyan)';
              if (arrow.color === '#f97316') markerUrl = 'url(#arrow-orange)';
              if (arrow.color === '#ef4444') markerUrl = 'url(#arrow-red)';

              return (
                <g key={arrow.id}>
                  {/* Sombra de contraste */}
                  <path d={d} fill="none" stroke="#000000" strokeWidth="5" opacity="0.8" />
                  {/* Línea de flecha */}
                  <path
                    d={d}
                    fill="none"
                    stroke={arrow.color}
                    strokeWidth={arrow.strokeWidth}
                    strokeDasharray={arrow.dashed ? '6,4' : 'none'}
                    markerEnd={markerUrl}
                  />
                </g>
              );
            })}
          </svg>

          {/* Cabecera de Años */}
          <div className="grid grid-cols-10 gap-2 mb-1.5 text-center">
            <div className="col-span-2 bg-[#18181b] border border-zinc-700 py-1 rounded text-xs font-black tracking-wider text-zinc-200">
              Año 1
            </div>
            <div className="col-span-2 bg-[#18181b] border border-zinc-700 py-1 rounded text-xs font-black tracking-wider text-zinc-200">
              Año 2
            </div>
            <div className="col-span-2 bg-[#18181b] border border-zinc-700 py-1 rounded text-xs font-black tracking-wider text-zinc-200">
              Año 3
            </div>
            <div className="col-span-2 bg-[#18181b] border border-zinc-700 py-1 rounded text-xs font-black tracking-wider text-zinc-200">
              Año 4
            </div>
            <div className="col-span-2 bg-[#18181b] border border-zinc-700 py-1 rounded text-xs font-black tracking-wider text-zinc-200">
              Año 5
            </div>
          </div>

          {/* Cabecera de Semestres (I a X) */}
          <div className="grid grid-cols-10 gap-2 mb-3 text-center">
            {semestersData.map(sem => (
              <div
                key={sem.num}
                className="bg-[#121214] border border-zinc-800 py-0.5 rounded text-[11px] font-mono font-bold text-zinc-300"
              >
                {sem.roman}
              </div>
            ))}
          </div>

          {/* PARTE SUPERIOR: RAMOS TRONCALES / DISCIPLINARES */}
          <div className="grid grid-cols-10 gap-2 items-start">
            {semestersData.map(sem => (
              <div key={sem.num} className="flex flex-col gap-2 min-h-[420px]">
                {sem.troncales.map(course => (
                  <CourseCard key={course.id} course={course} />
                ))}
              </div>
            ))}
          </div>

          {/* SEPARADOR VISUAL DE CURSOS TRANSVERSALES E IDIOMAS */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px bg-zinc-800 flex-1" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Cursos Transversales & Idiomas
            </span>
            <div className="h-px bg-zinc-800 flex-1" />
          </div>

          {/* PARTE INFERIOR: RAMOS TRANSVERSALES E INGLÉS */}
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

      {/* ================= TOOLTIP FLOTANTE AL PASAR EL CURSOR (COMO EN LA IMAGEN 2) ================= */}
      {hoveredInfo && (
        <div
          className="fixed pointer-events-none z-50 bg-[#121214]/95 border border-zinc-600 rounded-lg p-2.5 shadow-2xl text-left text-xs max-w-xs backdrop-blur-md"
          style={{
            left: `${Math.min(window.innerWidth - 300, mousePos.x + 18)}px`,
            top: `${Math.min(window.innerHeight - 150, mousePos.y + 18)}px`
          }}
        >
          <div className="font-mono font-bold text-pink-400 text-[11px] mb-0.5">
            Ramo N° {hoveredInfo.course.numero} • {hoveredInfo.course.codigo}
          </div>
          <div className="font-bold text-white text-xs mb-1">
            {hoveredInfo.course.nombre}
          </div>
          <p className="text-[10.5px] text-zinc-300 mb-1.5 leading-snug">
            Este ramo tiene <strong className="text-white">{hoveredInfo.course.creditos} créditos</strong> SCT.
          </p>
          <div className="text-[10px] text-zinc-400 space-y-0.5 border-t border-zinc-700/60 pt-1">
            <div>
              <span className="text-orange-400 font-bold">Prerrequisitos: </span>
              {hoveredInfo.course.prerrequisitos.length === 0
                ? 'Ninguno (Inicial)'
                : hoveredInfo.course.prerrequisitos.join(', ')}
            </div>
            {hoveredInfo.course.correquisitos && hoveredInfo.course.correquisitos.length > 0 && (
              <div>
                <span className="text-rose-400 font-bold">Ligado con: </span>
                {hoveredInfo.course.correquisitos.join(', ')}
              </div>
            )}
            <div>
              <span className="text-cyan-400 font-bold">Abre a futuro: </span>
              {Array.from(hoveredInfo.unlocks).length === 0
                ? 'Ninguno posterior'
                : Array.from(hoveredInfo.unlocks).join(', ')}
            </div>
          </div>
        </div>
      )}

      {/* ================= BARRA INFERIOR DE ESTADÍSTICAS ================= */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 bg-[#0a0a0c]/98 backdrop-blur-md border-t border-zinc-800 p-3 shadow-2xl">
        <div className="max-w-[1920px] mx-auto flex flex-col md:flex-row items-center justify-between gap-3 px-2">

          {/* Leyenda de Colores */}
          <div className="flex items-center gap-2 overflow-x-auto text-[11px] text-zinc-300 max-w-full">
            {mallaData.categorias.map(cat => (
              <div
                key={cat.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#121214] border border-zinc-800 whitespace-nowrap"
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
                <span className="w-4 h-4 rounded-full bg-white text-black font-black text-[9px] flex items-center justify-center">
                  #
                </span>
                <div>
                  <h4 className="font-bold text-white">Número de serie del ramo</h4>
                  <p className="text-zinc-400 text-[11px] mt-0.5">
                    Cada ramo tiene un número correlativo oficial (del 1 al 45) en la esquina superior derecha.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex gap-3 items-start">
                <div className="flex gap-1">
                  <span className="w-3.5 h-3.5 rounded-full bg-[#0284c7] text-white text-[8px] font-black flex items-center justify-center">
                    1
                  </span>
                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-400 text-black text-[8px] font-black flex items-center justify-center">
                    7
                  </span>
                </div>
                <div>
                  <h4 className="font-bold text-white">Círculos de dependencias (Pie de tarjeta)</h4>
                  <p className="text-zinc-400 text-[11px] mt-0.5">
                    Indican el número del ramo del cual depende. Se ponen en verde si ya aprobaste ese prerrequisito.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex gap-3 items-start">
                <div className="w-4 h-4 text-rose-500 font-black">/</div>
                <div>
                  <h4 className="font-bold text-rose-400">Franja roja diagonal (Aprobado)</h4>
                  <p className="text-zinc-400 text-[11px] mt-0.5">
                    Al hacer clic en un ramo, se tacha con una franja roja diagonal que marca que está aprobado.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/50 flex gap-3 items-start">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-300">Estrella dorada (Campo Clínico)</h4>
                  <p className="text-zinc-300 text-[11px] mt-0.5">
                    Indica que el ramo posee componente obligatorio de <strong>campo clínico asistencial</strong>.
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
              <Sparkles className="w-5 h-5 text-blue-400" />
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
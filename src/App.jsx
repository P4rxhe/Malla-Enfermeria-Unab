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
  ZoomOut,
  Check,
  Lock
} from 'lucide-react';
import mallaData from './data/mallaEnfermeria.json';

const STORAGE_KEY = 'malla_enfermeria_unab_aprobados_v7';

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
  const [tooltipData, setTooltipData] = useState(null);
  const [highlightClinics, setHighlightClinics] = useState(false);
  const [search, setSearch] = useState('');
  const [showModalInfo, setShowModalInfo] = useState(false);
  const [showFastApproveModal, setShowFastApproveModal] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(90);

  const containerRef = useRef(null);
  const cardElementsRef = useRef(new Map());
  const hoverTimerRef = useRef(null);
  const currentHoveredIdRef = useRef(null);

  // Guardar en localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(approved));
    } catch (e) {
      console.error(e);
    }
  }, [approved]);

  // Limpiar temporizador al desmontar
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  // Mapas de ramos por ID y por Número correlativo
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

  // Confeti al completar el 100%
  useEffect(() => {
    if (approved.length === totalRamos && totalRamos > 0) {
      confetti({ particleCount: 180, spread: 110, origin: { y: 0.6 } });
    }
  }, [approved.length, totalRamos]);

  // Ramos que este curso abre hacia el futuro
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

  // Comprobar si un ramo está habilitado (todos sus prerrequisitos aprobados)
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
      // Si ya está aprobado, al desmarcarlo se desaprueban los que dependían de él
      const dependentIds = getAllDescendants(course.id);
      const toRemove = [course.id, ...dependentIds.filter(id => approved.includes(id))];
      setApproved(prev => prev.filter(id => !toRemove.includes(id)));
    } else {
      // Si se aprueba, se aprueban automáticamente sus prerrequisitos faltantes
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

  // Reinicio directo sin confirmación molesta
  const handleClear = () => {
    setApproved([]);
  };

  const handleApproveUntilSemester = (targetSemester) => {
    const targetCourses = mallaData.ramos
      .filter(r => r.semestre <= targetSemester)
      .map(r => r.id);
    setApproved(prev => [...new Set([...prev, ...targetCourses])]);
    setShowFastApproveModal(false);
  };

  // Datos del ramo sobre el cual está el cursor
  const hoveredInfo = useMemo(() => {
    if (!hoveredCourseId) return null;
    const current = courseMap.get(hoveredCourseId);
    if (!current) return null;

    const prereqs = new Set(current.prerrequisitos || []);
    const coreqs = new Set(current.correquisitos || []);
    const unlocks = new Set(directDependents.get(hoveredCourseId) || []);

    return { course: current, prereqs, coreqs, unlocks };
  }, [hoveredCourseId, courseMap, directDependents]);

  // Manejador de entrada con temporizador EXACTO de 3 segundos (3000 ms)
  const handleMouseEnterCard = (course, event) => {
    currentHoveredIdRef.current = course.id;
    setHoveredCourseId(course.id);

    // Cancelar cualquier temporizador previo
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setTooltipData(null);

    const rect = event.currentTarget.getBoundingClientRect();
    const pos = {
      top: Math.min(window.innerHeight - 250, rect.bottom + 8),
      left: Math.max(16, Math.min(window.innerWidth - 340, rect.left - 20))
    };

    // Temporizador EXACTO de 3 segundos (3000 ms, ni más ni menos)
    hoverTimerRef.current = setTimeout(() => {
      if (currentHoveredIdRef.current === course.id) {
        setTooltipData({ course, pos });
      }
    }, 3000);
  };

  const handleMouseLeaveCard = (course) => {
    if (currentHoveredIdRef.current === course.id) {
      currentHoveredIdRef.current = null;
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      setHoveredCourseId(null);
      setTooltipData(null);
    }
  };

  // CÁLCULO PRECISO DE FLECHAS SVG (100% INMUNE AL ZOOM Y AL ESCALADO)
  const activeArrows = useMemo(() => {
    if (!hoveredInfo || !containerRef.current) return [];
    const { course, prereqs, coreqs, unlocks } = hoveredInfo;
    const activeEl = cardElementsRef.current.get(course.id);
    if (!activeEl) return [];

    const containerRect = containerRef.current.getBoundingClientRect();
    const scale = zoomLevel / 100;

    const aRect = activeEl.getBoundingClientRect();
    const activeBox = {
      left: (aRect.left - containerRect.left) / scale,
      right: (aRect.right - containerRect.left) / scale,
      top: (aRect.top - containerRect.top) / scale,
      bottom: (aRect.bottom - containerRect.top) / scale,
      centerX: (aRect.left - containerRect.left + aRect.width / 2) / scale,
      centerY: (aRect.top - containerRect.top + aRect.height / 2) / scale
    };

    const arrows = [];

    // 1. FLECHAS NARANJAS: PRERREQUISITOS PREVIOS (apuntan HACIA el ramo activo)
    prereqs.forEach(prereqId => {
      const el = cardElementsRef.current.get(prereqId);
      if (el) {
        const r = el.getBoundingClientRect();
        const fromX = (r.right - containerRect.left) / scale;
        const fromY = (r.top - containerRect.top + r.height / 2) / scale;
        const toX = activeBox.left;
        const toY = activeBox.centerY;

        const dx = toX - fromX;
        let d = '';
        if (dx > 15) {
          const cpOffset = Math.min(Math.max(dx * 0.45, 25), 100);
          d = `M ${fromX} ${fromY} C ${fromX + cpOffset} ${fromY}, ${toX - cpOffset} ${toY}, ${toX} ${toY}`;
        } else {
          const midX = (fromX + toX) / 2;
          const midY = (fromY + toY) / 2;
          d = `M ${fromX} ${fromY} Q ${midX - 35} ${midY}, ${toX} ${toY}`;
        }

        arrows.push({
          id: `pre-${prereqId}-${course.id}`,
          d,
          color: '#f97316',
          dashed: false,
          strokeWidth: 2.2
        });
      }
    });

    // 2. FLECHAS CELESTES: RAMOS QUE ABRE HACIA EL FUTURO (apuntan DESDE el ramo activo HACIA los que desbloquea)
    unlocks.forEach(unlockId => {
      const el = cardElementsRef.current.get(unlockId);
      if (el) {
        const r = el.getBoundingClientRect();
        const fromX = activeBox.right;
        const fromY = activeBox.centerY;
        const toX = (r.left - containerRect.left) / scale;
        const toY = (r.top - containerRect.top + r.height / 2) / scale;

        const dx = toX - fromX;
        let d = '';
        if (dx > 15) {
          const cpOffset = Math.min(Math.max(dx * 0.45, 25), 100);
          d = `M ${fromX} ${fromY} C ${fromX + cpOffset} ${fromY}, ${toX - cpOffset} ${toY}, ${toX} ${toY}`;
        } else {
          const midX = (fromX + toX) / 2;
          const midY = (fromY + toY) / 2;
          d = `M ${fromX} ${fromY} Q ${midX + 35} ${midY}, ${toX} ${toY}`;
        }

        arrows.push({
          id: `unl-${course.id}-${unlockId}`,
          d,
          color: '#38bdf8',
          dashed: true,
          strokeWidth: 2.2
        });
      }
    });

    // 3. FLECHAS ROJAS: CORREQUISITOS (ramos simultáneos)
    coreqs.forEach(coId => {
      const el = cardElementsRef.current.get(coId);
      if (el) {
        const r = el.getBoundingClientRect();
        const fromX = activeBox.centerX;
        const fromY = activeBox.bottom;
        const toX = (r.left - containerRect.left + r.width / 2) / scale;
        const toY = (r.top - containerRect.top) / scale;

        const midY = (fromY + toY) / 2;
        const d = `M ${fromX} ${fromY} Q ${(fromX + toX) / 2 + 25} ${midY}, ${toX} ${toY}`;

        arrows.push({
          id: `co-${course.id}-${coId}`,
          d,
          color: '#ef4444',
          dashed: true,
          strokeWidth: 2
        });
      }
    });

    return arrows;
  }, [hoveredInfo, zoomLevel]);

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

  // COMPONENTE DE TARJETA DE RAMO
  const CourseCard = ({ course }) => {
    const isApp = approved.includes(course.id);
    const unlocked = isUnlocked(course);
    const isHovered = hoveredInfo?.course.id === course.id;
    const isPrereq = hoveredInfo?.prereqs.has(course.id);
    const isCoreq = hoveredInfo?.coreqs.has(course.id);
    const isUnlockTarget = hoveredInfo?.unlocks.has(course.id);

    const isClinical = course.campoClinico;

    // Búsqueda
    const matchesSearch = search.trim() === '' ||
      course.nombre.toLowerCase().includes(search.toLowerCase()) ||
      course.codigo.toLowerCase().includes(search.toLowerCase()) ||
      String(course.numero) === search.trim();

    // ESTADO DE DISPONIBILIDAD ESTÁNDAR
    let stateBorder = 'border-zinc-800';
    let opacityStyle = 'opacity-100';

    if (!isApp) {
      if (unlocked) {
        // HABILITADO / APTO: Borde verde brillante, 100% visible
        stateBorder = 'border-2 border-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.35)]';
        opacityStyle = 'opacity-100';
      } else {
        // BLOQUEADO / AÚN NO SE ABRE: Muy opaco/apagado (opacity-35) y borde rojo
        stateBorder = 'border border-red-500/60 shadow-[0_0_4px_rgba(239,68,68,0.2)]';
        opacityStyle = 'opacity-35 hover:opacity-75';
      }
    } else {
      // APROBADO: Borde sutil y buena visibilidad con franja roja diagonal
      stateBorder = 'border border-zinc-700/80';
      opacityStyle = 'opacity-85 hover:opacity-100';
    }

    // MODO "CONTIENE CAMPO CLÍNICO":
    // Si está activado, los ramos clínicos se distinguen notablemente (aunque no estén habilitados),
    // y el que esté habilitado se ve COMPLETAMENTE MÁS LLAMATIVO con resplandor dorado/esmeralda y pulso.
    let clinicalHighlightClass = '';
    if (highlightClinics) {
      if (isClinical) {
        if (unlocked && !isApp) {
          // Habilitado + Clínico: Máximo resplandor y llamado visual
          clinicalHighlightClass = 'ring-4 ring-amber-300 border-2 border-emerald-400 shadow-[0_0_25px_rgba(251,191,36,0.9)] scale-[1.04] z-20 brightness-125 opacity-100 animate-pulse';
        } else if (isApp) {
          clinicalHighlightClass = 'ring-2 ring-amber-400 border border-amber-400/80 shadow-[0_0_12px_rgba(251,191,36,0.5)] z-10 opacity-95';
        } else {
          // Bloqueado pero Clínico: Se nota y distingue claramente de los demás
          clinicalHighlightClass = 'ring-2 ring-amber-500/90 border-2 border-amber-500/80 shadow-[0_0_14px_rgba(245,158,11,0.6)] z-10 brightness-110 opacity-85';
        }
      } else {
        // No tiene campo clínico: se atenúa para destacar las clínicas
        opacityStyle = 'opacity-20 pointer-events-none grayscale-[40%]';
      }
    }

    // RESALTADOS DINÁMICOS AL PONER EL CURSOR SOBRE UN RAMO
    let hoverRing = '';
    if (isHovered) {
      hoverRing = 'ring-2 ring-white scale-[1.03] shadow-2xl z-30 brightness-110 opacity-100';
    } else if (isPrereq) {
      // Prerrequisito que este ramo necesita: Iluminado en NARANJA
      hoverRing = 'ring-2 ring-orange-500 scale-[1.02] shadow-[0_0_15px_rgba(249,115,22,0.7)] z-20 brightness-110 opacity-100';
    } else if (isUnlockTarget) {
      // Ramo futuro que este ramo abre: Iluminado en CELESTE / CYAN
      hoverRing = 'ring-2 ring-cyan-400 scale-[1.02] shadow-[0_0_15px_rgba(56,189,248,0.7)] z-20 brightness-110 opacity-100';
    } else if (isCoreq) {
      hoverRing = 'ring-2 ring-red-500 scale-[1.02] shadow-[0_0_15px_rgba(239,68,68,0.7)] z-20 opacity-100';
    }

    if (!matchesSearch) {
      opacityStyle = 'opacity-15 pointer-events-none';
    }

    return (
      <div
        ref={el => {
          if (el) cardElementsRef.current.set(course.id, el);
          else cardElementsRef.current.delete(course.id);
        }}
        onClick={() => handleToggleCourse(course)}
        onMouseEnter={(e) => handleMouseEnterCard(course, e)}
        onMouseLeave={() => handleMouseLeaveCard(course)}
        className={`
          relative w-[145px] h-[92px] flex-shrink-0 rounded-md flex flex-col justify-between cursor-pointer transition-all duration-75 select-none overflow-hidden
          ${clinicalHighlightClass || stateBorder}
          ${hoverRing}
          ${clinicalHighlightClass ? '' : opacityStyle}
        `}
        style={{
          boxShadow: isHovered ? '0 10px 25px rgba(0,0,0,0.8)' : '0 2px 5px rgba(0,0,0,0.5)'
        }}
      >
        {/* ================= BARRA SUPERIOR DE LA TARJETA ================= */}
        <div className="bg-[#121316] px-1.5 py-0.5 flex items-center justify-between border-b border-black/40">
          <div className="flex items-center gap-1 min-w-0">
            {/* Punto indicador de estado: Verde = Habilitado, Rojo = Bloqueado */}
            {!isApp && (
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  unlocked
                    ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                    : 'bg-red-500/80'
                }`}
                title={unlocked ? 'Habilitado para cursar' : 'Bloqueado por prerrequisitos'}
              />
            )}
            <span className="font-mono text-[9.5px] font-bold text-zinc-300 truncate tracking-tight">
              {course.codigo}
            </span>
            {course.campoClinico && (
              <Star
                className="w-3 h-3 text-amber-400 fill-amber-400 flex-shrink-0"
                title="Campo Clínico Obligatorio"
              />
            )}
            {course.correquisitos && course.correquisitos.length > 0 && (
              <LinkIcon
                className="w-2.5 h-2.5 text-rose-400 flex-shrink-0"
                title={`Co-requisito con: ${course.correquisitos.join(', ')}`}
              />
            )}
          </div>

          {/* Número correlativo del ramo (1 al 45) en círculo blanco */}
          <span
            className="w-4 h-4 rounded-full bg-white text-black font-black text-[9px] flex items-center justify-center flex-shrink-0 shadow-sm"
            title={`Ramo correlativo N° ${course.numero}`}
          >
            {course.numero}
          </span>
        </div>

        {/* ================= CUERPO CENTRAL DE LA TARJETA (COLOR VIVO) ================= */}
        <div
          className="flex-1 flex items-center justify-center p-1.5 relative overflow-hidden"
          style={{ backgroundColor: course.color }}
        >
          <div
            className="text-[11.5px] font-bold text-center leading-[1.18] line-clamp-3 z-10 drop-shadow-sm px-0.5"
            style={{ color: course.textColor || '#ffffff' }}
          >
            {course.nombre}
          </div>

          {/* ================= FRANJA ROJA DIAGONAL (APROBADO) ================= */}
          {isApp && (
            <div className="absolute inset-0 pointer-events-none z-20">
              <svg className="w-full h-full">
                <line
                  x1="0"
                  y1="0"
                  x2="100%"
                  y2="100%"
                  stroke="#ef4444"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          )}

          {isApp && <div className="absolute inset-0 bg-black/40 z-10" />}

          {/* Insignia cuando el filtro de Campos Clínicos está activo */}
          {highlightClinics && isClinical && (
            <div
              className={`absolute bottom-0 right-0 z-20 px-1 py-0.2 rounded-tl text-[8px] font-black uppercase tracking-wider ${
                unlocked && !isApp
                  ? 'bg-amber-300 text-black shadow-md'
                  : 'bg-amber-500/90 text-white'
              }`}
            >
              {unlocked && !isApp ? '★ Habilitado' : '★ Clínico'}
            </div>
          )}
        </div>

        {/* ================= BARRA INFERIOR (DEPENDENCIAS Y CRÉDITOS) ================= */}
        <div className="bg-[#121316] px-1.5 py-0.5 flex items-center justify-between border-t border-black/40">
          <div
            className="flex items-center gap-1 min-w-0"
            title={`Depende de los ramos N°: ${course.prerrequisitosNumeros.join(', ') || 'Ninguno (Inicial)'}`}
          >
            {course.prerrequisitosNumeros.length === 0 ? (
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-700/60" />
            ) : (
              course.prerrequisitosNumeros.map(num => {
                const reqCourse = numberMap.get(num);
                const reqApp = reqCourse ? approved.includes(reqCourse.id) : false;
                return (
                  <span
                    key={num}
                    className={`w-3.5 h-3.5 rounded-full text-[8.5px] font-black flex items-center justify-center border ${
                      reqApp
                        ? 'bg-emerald-500 text-black border-emerald-300' // Verde si aprobado / habilitado
                        : 'bg-red-500 text-white border-red-300'       // Rojo si no aprobado / pendiente
                    }`}
                  >
                    {num}
                  </span>
                );
              })
            )}
          </div>

          <span className="font-mono text-[9px] font-bold text-zinc-300 bg-zinc-800 px-1 py-0.2 rounded border border-zinc-700">
            {course.creditos}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#070709] text-white flex flex-col font-sans select-none pb-36">

      {/* ================= BARRA SUPERIOR ================= */}
      <header className="sticky top-0 z-40 bg-[#0c0d10]/95 backdrop-blur-md border-b border-zinc-800 px-5 py-3 shadow-xl">
        <div className="max-w-[1920px] mx-auto flex flex-wrap items-center justify-between gap-3">

          {/* Título principal */}
          <div>
            <h1 className="text-base md:text-xl font-black tracking-tight text-white">
              Malla Interactiva Enfermería UNAB
            </h1>
            <p className="text-xs text-zinc-400 hidden sm:block">
              Verde: habilitado • Rojo: bloqueado • Flechas directas y formato adaptable
            </p>
          </div>

          {/* Barra de Controles: Buscador, Zoom, Campos Clínicos, Simbología */}
          <div className="flex items-center flex-wrap gap-2.5">

            {/* Buscador */}
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar ramo..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 w-36 md:w-48"
              />
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2 top-2.5" />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-2 text-zinc-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Control de Zoom (+ / - / Reset) */}
            <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-lg px-1.5 py-1 text-xs text-zinc-300">
              <button
                onClick={() => setZoomLevel(prev => Math.max(60, prev - 5))}
                className="p-1 hover:text-white transition"
                title="Alejar vista (Zoom -)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoomLevel(90)}
                className="px-2 font-mono text-xs font-bold text-zinc-200 hover:text-blue-400"
                title="Restablecer zoom al 90%"
              >
                {zoomLevel}%
              </button>
              <button
                onClick={() => setZoomLevel(prev => Math.min(125, prev + 5))}
                className="p-1 hover:text-white transition"
                title="Acercar vista (Zoom +)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Botón Contiene Campo Clínico */}
            <button
              onClick={() => setHighlightClinics(!highlightClinics)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                highlightClinics
                  ? 'bg-amber-500/30 text-amber-300 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.6)]'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800'
              }`}
            >
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>Contiene Campo Clínico</span>
            </button>

            {/* Aprobación Rápida */}
            <button
              onClick={() => setShowFastApproveModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 transition"
              title="Aprobar hasta semestre X"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden md:inline">Aprobar Semestre</span>
            </button>

            {/* Simbología */}
            <button
              onClick={() => setShowModalInfo(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 transition"
            >
              <HelpCircle className="w-3.5 h-3.5 text-pink-400" />
              <span>Simbología</span>
            </button>
          </div>
        </div>
      </header>

      {/* ================= CONTENEDOR PRINCIPAL CENTRADO Y ADAPTABLE ================= */}
      <main className="flex-1 overflow-x-auto overflow-y-visible px-6 py-6 w-full flex justify-center">
        {/* Contenedor centrado con m-auto y origin-top */}
        <div
          ref={containerRef}
          className="relative m-auto min-w-max transition-transform duration-75 origin-top"
          style={{ transform: `scale(${zoomLevel / 100})` }}
        >
          {/* ================= CAPA DE FLECHAS SVG DIRECTAS Y PRECISAS ================= */}
          <svg
            className="absolute inset-0 pointer-events-none z-30 w-full h-full"
            style={{ minWidth: '100%', minHeight: '100%', pointerEvents: 'none' }}
          >
            <defs>
              {/* Flecha Naranja (Prerrequisitos previos directos) */}
              <marker
                id="arrow-orange"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M 0 0.5 L 5 3 L 0 5.5 z" fill="#f97316" />
              </marker>

              {/* Flecha Celeste (Ramos que desbloquea a futuro) */}
              <marker
                id="arrow-cyan"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M 0 0.5 L 5 3 L 0 5.5 z" fill="#38bdf8" />
              </marker>

              {/* Flecha Roja (Co-requisitos vinculados) */}
              <marker
                id="arrow-red"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M 0 0.5 L 5 3 L 0 5.5 z" fill="#ef4444" />
              </marker>
            </defs>

            {activeArrows.map(arrow => {
              let markerUrl = 'url(#arrow-cyan)';
              if (arrow.color === '#f97316') markerUrl = 'url(#arrow-orange)';
              if (arrow.color === '#ef4444') markerUrl = 'url(#arrow-red)';

              return (
                <g key={arrow.id} style={{ pointerEvents: 'none' }}>
                  {/* Sombra de contraste para que la flecha destaque siempre */}
                  <path d={arrow.d} fill="none" stroke="#000000" strokeWidth="4" opacity="0.6" />
                  <path
                    d={arrow.d}
                    fill="none"
                    stroke={arrow.color}
                    strokeWidth={arrow.strokeWidth}
                    strokeDasharray={arrow.dashed ? '5,4' : 'none'}
                    markerEnd={markerUrl}
                  />
                </g>
              );
            })}
          </svg>

          {/* Cabecera de Años: Ancho 308px (2 columnas de 145px + 1 gap de 18px = 308px) */}
          <div className="flex gap-[18px] mb-2 text-center">
            <div className="w-[308px] bg-[#18191d] border border-zinc-700 py-1.5 rounded text-xs font-black tracking-wider text-zinc-200">
              Año 1
            </div>
            <div className="w-[308px] bg-[#18191d] border border-zinc-700 py-1.5 rounded text-xs font-black tracking-wider text-zinc-200">
              Año 2
            </div>
            <div className="w-[308px] bg-[#18191d] border border-zinc-700 py-1.5 rounded text-xs font-black tracking-wider text-zinc-200">
              Año 3
            </div>
            <div className="w-[308px] bg-[#18191d] border border-zinc-700 py-1.5 rounded text-xs font-black tracking-wider text-zinc-200">
              Año 4
            </div>
            <div className="w-[308px] bg-[#18191d] border border-zinc-700 py-1.5 rounded text-xs font-black tracking-wider text-zinc-200">
              Año 5
            </div>
          </div>

          {/* Cabecera de Semestres (I a X): Con separación multiplicada por 1.5x (18px) */}
          <div className="flex gap-[18px] mb-3.5 text-center">
            {semestersData.map(sem => (
              <div
                key={sem.num}
                className="w-[145px] flex-shrink-0 bg-[#121316] border border-zinc-800 py-1 rounded text-xs font-mono font-bold text-zinc-300"
              >
                {sem.roman}
              </div>
            ))}
          </div>

          {/* PARTE SUPERIOR: RAMOS TRONCALES (Separación horizontal 18px, vertical 15px) */}
          <div className="flex gap-[18px] items-start">
            {semestersData.map(sem => (
              <div key={sem.num} className="w-[145px] flex-shrink-0 flex flex-col gap-[15px] min-h-[480px]">
                {sem.troncales.map(course => (
                  <CourseCard key={course.id} course={course} />
                ))}
              </div>
            ))}
          </div>

          {/* SEPARADOR VISUAL DE CURSOS TRANSVERSALES */}
          <div className="my-7 flex items-center gap-3 w-full">
            <div className="h-px bg-zinc-800 flex-1" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 whitespace-nowrap">
              Cursos Transversales & Idiomas
            </span>
            <div className="h-px bg-zinc-800 flex-1" />
          </div>

          {/* PARTE INFERIOR: RAMOS TRANSVERSALES E INGLÉS */}
          <div className="flex gap-[18px] items-start">
            {semestersData.map(sem => (
              <div key={sem.num} className="w-[145px] flex-shrink-0 flex flex-col gap-[15px]">
                {sem.transversales.map(course => (
                  <CourseCard key={course.id} course={course} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ================= TOOLTIP ESTABLE TRAS EXACTAMENTE 3 SEGUNDOS ================= */}
      {tooltipData && (
        <div
          className="fixed pointer-events-none z-50 bg-[#121316]/95 border border-zinc-600 rounded-lg p-3 shadow-2xl text-left text-xs max-w-sm backdrop-blur-md animate-in fade-in duration-200"
          style={{
            left: `${tooltipData.pos.left}px`,
            top: `${tooltipData.pos.top}px`
          }}
        >
          <div className="font-mono font-bold text-pink-400 text-xs mb-0.5">
            Ramo N° {tooltipData.course.numero} • {tooltipData.course.codigo}
          </div>
          <div className="font-bold text-white text-sm mb-1">
            {tooltipData.course.nombre}
          </div>
          <p className="text-[11px] text-zinc-300 mb-2 leading-snug">
            Este ramo tiene <strong className="text-white">{tooltipData.course.creditos} créditos</strong> SCT.
          </p>
          <div className="text-[10.5px] text-zinc-400 space-y-1 border-t border-zinc-700/60 pt-1.5">
            <div>
              <span className="text-orange-400 font-bold">Prerrequisitos: </span>
              {tooltipData.course.prerrequisitos.length === 0
                ? 'Ninguno (Inicial)'
                : tooltipData.course.prerrequisitos.map(id => {
                    const c = courseMap.get(id);
                    return c ? `${c.nombre} (N° ${c.numero})` : id;
                  }).join(', ')}
            </div>
            {tooltipData.course.correquisitos && tooltipData.course.correquisitos.length > 0 && (
              <div>
                <span className="text-rose-400 font-bold">Co-requisitos: </span>
                {tooltipData.course.correquisitos.map(id => {
                  const c = courseMap.get(id);
                  return c ? `${c.nombre} (N° ${c.numero})` : id;
                }).join(', ')}
              </div>
            )}
            <div>
              <span className="text-cyan-400 font-bold">Habilita a futuro: </span>
              {directDependents.get(tooltipData.course.id)?.length > 0
                ? directDependents.get(tooltipData.course.id).map(id => {
                    const c = courseMap.get(id);
                    return c ? `${c.nombre} (N° ${c.numero})` : id;
                  }).join(', ')
                : 'Ninguno (Terminal)'}
            </div>
          </div>
        </div>
      )}

      {/* ================= BARRA INFERIOR FIJA ================= */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-[#0c0d10]/95 backdrop-blur-md border-t border-zinc-800 px-5 py-2.5">
        <div className="max-w-[1920px] mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">

          {/* Leyenda rápida */}
          <div className="flex items-center flex-wrap gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
              <span className="text-zinc-300 font-medium">Habilitado</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
              <span className="text-zinc-400">Bloqueado</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_6px_#f97316]" />
              <span className="text-zinc-400">Prerrequisito (Naranja)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#38bdf8]" />
              <span className="text-zinc-400">Desbloquea (Celeste)</span>
            </div>
          </div>

          {/* Estadísticas de Avance y Botón Limpiar */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-zinc-400">Créditos:</span>
              <span className="font-mono font-bold text-white">
                {creditosAprobados}/{totalCreditos}
              </span>
              <span className="text-zinc-400 font-mono text-[11px]">
                ({porcentajeCreditos}%)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-zinc-400">Ramos:</span>
              <span className="font-mono font-bold text-white">
                {approved.length}/{totalRamos} ({porcentajeRamos}%)
              </span>
            </div>

            <button
              onClick={handleClear}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-red-950/60 hover:text-red-300 border border-zinc-700 text-zinc-400 transition"
              title="Reiniciar todos los ramos aprobados inmediatamente"
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

            <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-pink-400" />
              Simbología y Mecánicas de la Malla
            </h3>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 rounded-xl bg-zinc-950 border border-emerald-500/50 flex gap-3 items-start">
                <span className="w-4 h-4 rounded-full bg-emerald-400 text-black font-black text-[9px] flex items-center justify-center shadow-[0_0_8px_#34d399]">
                  ✓
                </span>
                <div>
                  <h4 className="font-bold text-emerald-300">Borde Verde / Círculo Verde (Habilitado)</h4>
                  <p className="text-zinc-400 text-[11px] mt-0.5">
                    El ramo está <strong>listo para ser cursado</strong> porque ya tienes aprobados todos sus prerrequisitos.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-red-500/50 flex gap-3 items-start">
                <span className="w-4 h-4 rounded-full bg-red-500 text-white font-black text-[9px] flex items-center justify-center">
                  ✕
                </span>
                <div>
                  <h4 className="font-bold text-red-400">Borde Rojo / Opaco (Bloqueado)</h4>
                  <p className="text-zinc-400 text-[11px] mt-0.5">
                    El ramo está <strong>bloqueado</strong> y aparece opaco porque te faltan prerrequisitos por aprobar.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-orange-500/50 flex gap-3 items-start">
                <span className="w-4 h-4 rounded-full bg-orange-500 text-black font-black text-[9px] flex items-center justify-center">
                  ←
                </span>
                <div>
                  <h4 className="font-bold text-orange-400">Flecha Naranja y Resaltado Naranja</h4>
                  <p className="text-zinc-400 text-[11px] mt-0.5">
                    Señala los <strong>prerrequisitos previos directos</strong> que este ramo necesita para poder abrirse.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-cyan-500/50 flex gap-3 items-start">
                <span className="w-4 h-4 rounded-full bg-cyan-400 text-black font-black text-[9px] flex items-center justify-center">
                  →
                </span>
                <div>
                  <h4 className="font-bold text-cyan-300">Flecha Celeste y Resaltado Celeste</h4>
                  <p className="text-zinc-400 text-[11px] mt-0.5">
                    Señala los <strong>ramos futuros</strong> que este ramo habilitará una vez que lo apruebes.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex gap-3 items-start">
                <span className="w-4.5 h-4.5 rounded-full bg-white text-black font-black text-[10px] flex items-center justify-center">
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
                <div className="w-5 h-5 text-rose-500 font-black text-base flex items-center justify-center">/</div>
                <div>
                  <h4 className="font-bold text-rose-400">Franja roja diagonal (Aprobado)</h4>
                  <p className="text-zinc-400 text-[11px] mt-0.5">
                    Al hacer clic en un ramo, se marca con una franja roja diagonal que indica que está aprobado.
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

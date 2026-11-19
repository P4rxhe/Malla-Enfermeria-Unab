import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  ChevronRight,
  ChevronLeft,
  ArrowRight
} from 'lucide-react';
import mallaData from './data/mallaEnfermeria.json';

const STORAGE_KEY = 'malla_enfermeria_unab_aprobados_v2';

export default function App() {
  // Estado de ramos aprobados
  const [approved, setApproved] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [hoveredCourseId, setHoveredCourseId] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState(null); // Modal de detalles del ramo
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [onlyClinics, setOnlyClinics] = useState(false);
  const [search, setSearch] = useState('');
  const [showModalInfo, setShowModalInfo] = useState(false);
  const [showFastApproveModal, setShowFastApproveModal] = useState(false);
  const [activeSemFilter, setActiveSemFilter] = useState('all');

  const scrollContainerRef = useRef(null);
  const boardRef = useRef(null);
  const cardRefs = useRef(new Map());

  // Coordenadas dinámicas de flechas SVG
  const [connections, setConnections] = useState([]);

  // Guardar en localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(approved));
    } catch (e) {
      console.error('Error guardando progreso', e);
    }
  }, [approved]);

  // Mapa rápido de ramos por ID
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

  // Confeti de graduación
  useEffect(() => {
    if (approved.length === totalRamos && totalRamos > 0) {
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.6 }
      });
    }
  }, [approved.length, totalRamos]);

  // Verificar si un ramo está desbloqueado
  const isUnlocked = (course) => {
    if (!course.prerrequisitos || course.prerrequisitos.length === 0) return true;
    return course.prerrequisitos.every(reqId => approved.includes(reqId));
  };

  // Dependencias directas (quién depende de este ramo)
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

  // Ancestros y descendientes recursivos
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

  // Marcar / Desmarcar ramo
  const handleToggleCourse = (course) => {
    const isApproved = approved.includes(course.id);

    if (isApproved) {
      // Si desmarcamos, desmarcamos en cascada los que dependen de él
      const dependentIds = getAllDescendants(course.id);
      const toRemove = [course.id, ...dependentIds.filter(id => approved.includes(id))];
      setApproved(prev => prev.filter(id => !toRemove.includes(id)));
    } else {
      // Marcar ramo + auto-marcar prerrequisitos faltantes
      const missingAncestors = getAllAncestors(course.id).filter(id => !approved.includes(id));
      const toAdd = [course.id, ...missingAncestors];

      // Si tiene correquisitos ligados (línea roja punteada), se incluyen
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

  // Relaciones de hover
  const hoverRelationships = useMemo(() => {
    const targetId = hoveredCourseId || selectedCourse?.id;
    if (!targetId) return null;
    const current = courseMap.get(targetId);
    if (!current) return null;

    const prereqs = new Set(current.prerrequisitos || []);
    const coreqs = new Set(current.correquisitos || []);
    const unlocks = new Set(directDependents.get(targetId) || []);

    return { targetId, prereqs, coreqs, unlocks };
  }, [hoveredCourseId, selectedCourse, courseMap, directDependents]);

  // Cálculo de flechas dinámicas cuando hay un ramo activo (hover o seleccionado)
  useEffect(() => {
    const activeId = hoveredCourseId || selectedCourse?.id;
    if (!activeId || !boardRef.current) {
      setConnections([]);
      return;
    }

    const boardRect = boardRef.current.getBoundingClientRect();
    const activeEl = cardRefs.current.get(activeId);
    if (!activeEl) return;

    const currentCourse = courseMap.get(activeId);
    if (!currentCourse) return;

    const newConnections = [];
    const activeRect = activeEl.getBoundingClientRect();
    const activeCenter = {
      x: activeRect.left - boardRect.left + activeRect.width / 2,
      y: activeRect.top - boardRect.top + activeRect.height / 2,
      left: activeRect.left - boardRect.left,
      right: activeRect.right - boardRect.left,
      top: activeRect.top - boardRect.top,
      bottom: activeRect.bottom - boardRect.top,
    };

    // 1. Flechas de Prerrequisitos que ENTRAN al ramo activo
    (currentCourse.prerrequisitos || []).forEach(prereqId => {
      const prereqEl = cardRefs.current.get(prereqId);
      const prereqCourse = courseMap.get(prereqId);
      if (prereqEl && prereqCourse) {
        const r = prereqEl.getBoundingClientRect();
        const pSource = {
          x: r.right - boardRect.left,
          y: r.top - boardRect.top + r.height / 2,
        };
        const pTarget = {
          x: activeCenter.left,
          y: activeCenter.y,
        };

        // Color según el área del ramo de origen
        const cat = mallaData.categorias.find(c => c.id === prereqCourse.categoria);
        const color = cat?.arrowColor || '#ec4899';

        newConnections.push({
          id: `${prereqId}->${activeId}`,
          from: pSource,
          to: pTarget,
          color,
          dashed: false,
          label: 'Prerrequisito'
        });
      }
    });

    // 2. Flechas de Ramos que DESBLOQUEA hacia el futuro
    const unlockedIds = directDependents.get(activeId) || [];
    unlockedIds.forEach(targetId => {
      const targetEl = cardRefs.current.get(targetId);
      if (targetEl) {
        const r = targetEl.getBoundingClientRect();
        const pSource = {
          x: activeCenter.right,
          y: activeCenter.y,
        };
        const pTarget = {
          x: r.left - boardRect.left,
          y: r.top - boardRect.top + r.height / 2,
        };

        // Color del ramo actual
        const cat = mallaData.categorias.find(c => c.id === currentCourse.categoria);
        const color = cat?.arrowColor || '#3b82f6';

        newConnections.push({
          id: `${activeId}->${targetId}`,
          from: pSource,
          to: pTarget,
          color,
          dashed: false,
          label: 'Desbloquea'
        });
      }
    });

    // 3. Flechas de Ramos LIGADOS (Co-requisitos - Línea roja punteada)
    (currentCourse.correquisitos || []).forEach(coId => {
      const coEl = cardRefs.current.get(coId);
      if (coEl) {
        const r = coEl.getBoundingClientRect();
        const pSource = {
          x: activeCenter.x,
          y: activeCenter.bottom,
        };
        const pTarget = {
          x: r.left - boardRect.left + r.width / 2,
          y: r.top - boardRect.top,
        };

        newConnections.push({
          id: `${activeId}<->${coId}`,
          from: pSource,
          to: pTarget,
          color: '#ef4444',
          dashed: true,
          label: 'Co-requisito ligado'
        });
      }
    });

    setConnections(newConnections);
  }, [hoveredCourseId, selectedCourse, courseMap, directDependents]);

  // Lista de semestres filtrados
  const semesters = useMemo(() => {
    const list = [];
    for (let i = 1; i <= 10; i++) {
      const courses = mallaData.ramos.filter(r => {
        if (r.semestre !== i) return false;
        if (selectedCategory !== 'all' && r.categoria !== selectedCategory) return false;
        if (onlyClinics && !r.campoClinico) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          const matchCode = r.codigo.toLowerCase().includes(q);
          const matchName = r.nombre.toLowerCase().includes(q);
          if (!matchCode && !matchName) return false;
        }
        return true;
      });
      list.push({ semestre: i, courses });
    }
    return list;
  }, [selectedCategory, onlyClinics, search]);

  const scrollHorizontally = (direction) => {
    if (scrollContainerRef.current) {
      const scrollAmount = direction === 'left' ? -420 : 420;
      scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Helper de estilos por categoría según el PDF oficial
  const getCourseStyle = (course, isApp, unlocked, isHovered, isPrereq, isCoreq, isUnlockedTarget) => {
    const cat = mallaData.categorias.find(c => c.id === course.categoria);

    // Relación de hover
    if (isHovered) {
      return 'ring-4 ring-white shadow-2xl scale-[1.02] z-30 brightness-110';
    }
    if (isPrereq) {
      return 'ring-2 ring-emerald-400 bg-emerald-950/80 border-emerald-400 animate-pulse z-20';
    }
    if (isCoreq) {
      return 'ring-2 ring-red-500 border-dashed border-red-500 bg-red-950/80 animate-pulse z-20';
    }
    if (isUnlockedTarget) {
      return 'ring-2 ring-purple-400 bg-purple-950/80 border-purple-400 animate-pulse z-20';
    }

    // Aprobado
    if (isApp) {
      return 'bg-zinc-900/90 border-zinc-700/60 text-zinc-400 opacity-60 hover:opacity-95';
    }

    // Disponible
    if (unlocked) {
      switch (course.categoria) {
        case 'biomedicas':
          return 'bg-pink-950/40 border-pink-500/80 text-white hover:border-pink-300 hover:shadow-pink-950/50 hover:shadow-lg';
        case 'disciplinar':
          return 'bg-blue-950/50 border-blue-500/80 text-white hover:border-blue-300 hover:shadow-blue-950/50 hover:shadow-lg';
        case 'salud-publica':
          return 'bg-cyan-950/40 border-cyan-500/80 text-white hover:border-cyan-300 hover:shadow-cyan-950/50 hover:shadow-lg';
        case 'farmacologia':
          return 'bg-emerald-950/40 border-emerald-500/80 text-white hover:border-emerald-300 hover:shadow-emerald-950/50 hover:shadow-lg';
        case 'general-idiomas':
          return 'bg-amber-950/40 border-amber-500/80 text-white hover:border-amber-300 hover:shadow-amber-950/50 hover:shadow-lg';
        case 'integradores':
          return 'bg-indigo-950/60 border-indigo-500/90 text-white hover:border-indigo-300 hover:shadow-indigo-950/50 hover:shadow-lg';
        default:
          return 'bg-zinc-900 border-zinc-700 text-white';
      }
    }

    // Bloqueado
    return 'bg-black/80 border-zinc-800 text-zinc-500 opacity-70 hover:opacity-90';
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-sans select-none pb-44">

      {/* ================= BARRA SUPERIOR ================= */}
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800 px-4 py-3 shadow-2xl">
        <div className="max-w-[1920px] mx-auto flex flex-wrap items-center justify-between gap-3">

          {/* Logo y Carrera */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 via-indigo-600 to-pink-500 flex items-center justify-center text-xl shadow-lg border border-zinc-700">
              🩺
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg md:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  Malla Interactiva Enfermería UNAB
                </h1>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40">
                  Oficial
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                10 Semestres • Requisitos, Co-requisitos y Campos Clínicos • Fondo Negro de Alto Contraste
              </p>
            </div>
          </div>

          {/* Controles: Buscador + Filtros */}
          <div className="flex items-center flex-wrap gap-2">
            
            {/* Buscador */}
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar ramo o código..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 w-48 md:w-60"
              />
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-2 text-zinc-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filtro Campos Clínicos */}
            <button
              onClick={() => setOnlyClinics(!onlyClinics)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                onlyClinics
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-md shadow-amber-500/20'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800'
              }`}
            >
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>Solo Campos Clínicos</span>
            </button>

            {/* Aprobación Rápida */}
            <button
              onClick={() => setShowFastApproveModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 transition"
              title="Aprobar hasta semestre X"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Aprobación Rápida</span>
            </button>

            {/* Simbología */}
            <button
              onClick={() => setShowModalInfo(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 transition"
            >
              <HelpCircle className="w-3.5 h-3.5 text-pink-400" />
              <span>Simbología</span>
            </button>

            {/* Botones de desplazamiento */}
            <div className="hidden lg:flex items-center gap-1 border-l border-zinc-800 pl-2">
              <button
                onClick={() => scrollHorizontally('left')}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition"
                title="Desplazar a la izquierda"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => scrollHorizontally('right')}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition"
                title="Desplazar a la derecha"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filtro Móvil por Semestres */}
        <div className="md:hidden flex items-center gap-1.5 overflow-x-auto px-2 py-2 mt-2 border-t border-zinc-800/80">
          <button
            onClick={() => setActiveSemFilter('all')}
            className={`px-2.5 py-1 rounded text-xs whitespace-nowrap font-medium ${
              activeSemFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400'
            }`}
          >
            Todos
          </button>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(num => (
            <button
              key={num}
              onClick={() => setActiveSemFilter(num)}
              className={`px-2.5 py-1 rounded text-xs whitespace-nowrap font-medium ${
                activeSemFilter === num ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400'
              }`}
            >
              Sem {num}
            </button>
          ))}
        </div>
      </header>

      {/* ================= CONTENEDOR DE LA MALLA CON FLECHAS SVG ================= */}
      <main
        className="flex-1 overflow-x-auto overflow-y-visible px-6 py-6 relative"
        ref={scrollContainerRef}
      >
        <div className="relative inline-flex min-w-max pb-12" ref={boardRef}>
          
          {/* Capa de Flechas SVG entre ramos */}
          <svg
            className="absolute inset-0 pointer-events-none z-20 w-full h-full"
            style={{ minWidth: '100%', minHeight: '100%' }}
          >
            <defs>
              <marker
                id="arrowhead"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="4"
                orient="auto"
              >
                <polygon points="0 0, 8 4, 0 8" fill="#ffffff" />
              </marker>
            </defs>

            {connections.map(conn => {
              const dx = conn.to.x - conn.from.x;
              const dy = conn.to.y - conn.from.y;
              // Curva suave de Bézier
              const control1 = { x: conn.from.x + dx * 0.45, y: conn.from.y };
              const control2 = { x: conn.to.x - dx * 0.45, y: conn.to.y };
              const pathData = `M ${conn.from.x} ${conn.from.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${conn.to.x} ${conn.to.y}`;

              return (
                <g key={conn.id}>
                  {/* Sombra para contraste */}
                  <path
                    d={pathData}
                    fill="none"
                    stroke="#000000"
                    strokeWidth="5"
                    opacity="0.7"
                  />
                  {/* Línea principal coloreada con la sección */}
                  <path
                    d={pathData}
                    fill="none"
                    stroke={conn.color}
                    strokeWidth={conn.dashed ? '2.5' : '3'}
                    strokeDasharray={conn.dashed ? '6,5' : 'none'}
                    markerEnd="url(#arrowhead)"
                    className={conn.dashed ? 'animate-pulse' : ''}
                  />
                </g>
              );
            })}
          </svg>

          {/* Columnas de Semestres */}
          <div className="inline-flex gap-5">
            {semesters.map(({ semestre, courses }) => {
              if (activeSemFilter !== 'all' && activeSemFilter !== semestre) return null;

              const ano = Math.ceil(semestre / 2);
              const totalSemCreds = courses.reduce((s, c) => s + c.creditos, 0);
              const semAprobadosCount = courses.filter(c => approved.includes(c.id)).length;

              return (
                <div
                  key={semestre}
                  className="w-80 flex-shrink-0 flex flex-col bg-zinc-950/80 rounded-2xl border border-zinc-800 p-3.5 shadow-2xl backdrop-blur-sm"
                >
                  {/* Cabecera del Semestre */}
                  <div className="mb-3.5 pb-2.5 border-b border-zinc-800 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-pink-400">
                        Año {ano}
                      </span>
                      <h2 className="text-base font-bold text-white flex items-center gap-1.5">
                        {semestre}° Semestre
                      </h2>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-semibold text-zinc-400 block">
                        {totalSemCreds} Créditos
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        semAprobadosCount === courses.length && courses.length > 0
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-zinc-800 text-zinc-300'
                      }`}>
                        {semAprobadosCount}/{courses.length} aprobados
                      </span>
                    </div>
                  </div>

                  {/* Tarjetas de Ramos */}
                  <div className="flex flex-col gap-3">
                    {courses.length === 0 ? (
                      <div className="p-8 text-center text-zinc-600 text-xs italic">
                        Sin ramos con los filtros activos
                      </div>
                    ) : (
                      courses.map(course => {
                        const isApp = approved.includes(course.id);
                        const unlocked = isUnlocked(course);
                        const isHovered = (hoveredCourseId || selectedCourse?.id) === course.id;

                        const isPrereq = hoverRelationships?.prereqs.has(course.id);
                        const isCoreq = hoverRelationships?.coreqs.has(course.id);
                        const isUnlockedTarget = hoverRelationships?.unlocks.has(course.id);

                        const cardClass = getCourseStyle(
                          course,
                          isApp,
                          unlocked,
                          isHovered,
                          isPrereq,
                          isCoreq,
                          isUnlockedTarget
                        );

                        return (
                          <div
                            key={course.id}
                            ref={el => {
                              if (el) cardRefs.current.set(course.id, el);
                              else cardRefs.current.delete(course.id);
                            }}
                            onClick={() => handleToggleCourse(course)}
                            onMouseEnter={() => setHoveredCourseId(course.id)}
                            onMouseLeave={() => setHoveredCourseId(null)}
                            className={`
                              relative p-3.5 rounded-xl border-2 transition-all duration-200 cursor-pointer text-left
                              ${cardClass}
                            `}
                          >
                            {/* Fila Superior: Código + ⭐ Estrella + Co-requisito + Créditos */}
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <span className="font-mono text-xs font-black tracking-wider text-white">
                                {course.codigo}
                              </span>

                              <div className="flex items-center gap-1.5">
                                {/* ⭐ Estrella de Campo Clínico (Esquina superior derecha) */}
                                {course.campoClinico && (
                                  <div
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/50 text-amber-300 text-[10px] font-bold"
                                    title="Ramo con componente de Campo Clínico obligatorio"
                                  >
                                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                    <span className="hidden sm:inline">Clínica</span>
                                  </div>
                                )}

                                {/* Ramos Ligados (Línea roja punteada) */}
                                {course.correquisitos && course.correquisitos.length > 0 && (
                                  <div
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-500/20 border border-rose-500/60 text-rose-300 text-[10px] font-bold"
                                    title={`Co-requisito ligado: debe tomarse simultáneamente con ${course.correquisitos.join(', ')}`}
                                  >
                                    <LinkIcon className="w-3 h-3 text-rose-400" />
                                    <span className="hidden sm:inline">Ligado</span>
                                  </div>
                                )}

                                {/* Créditos */}
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 border border-zinc-700">
                                  {course.creditos} cr
                                </span>
                              </div>
                            </div>

                            {/* Nombre del Ramo (Siempre blanco, nítido y legible) */}
                            <h3 className={`text-sm font-bold leading-tight mb-2 text-white ${isApp ? 'line-through text-zinc-400' : ''}`}>
                              {course.nombre}
                            </h3>

                            {/* Estado y Requisitos */}
                            <div className="flex items-center justify-between text-[11px] pt-2 border-t border-zinc-800/80">
                              <div className="flex items-center gap-1">
                                {isApp ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Aprobado
                                  </span>
                                ) : unlocked ? (
                                  <span className="inline-flex items-center gap-1 text-cyan-400 font-bold">
                                    <Unlock className="w-3.5 h-3.5" /> Disponible
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-zinc-500 font-medium">
                                    <Lock className="w-3.5 h-3.5 text-zinc-600" /> Bloqueado
                                  </span>
                                )}
                              </div>

                              {/* Botón de Info rápida */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCourse(course);
                                }}
                                className="text-zinc-500 hover:text-white p-1 rounded hover:bg-zinc-800 transition"
                                title="Ver detalles y requisitos"
                              >
                                <Info className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* ================= BARRA INFERIOR DE LEYENDA Y MÉTRICAS ================= */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 bg-zinc-950/98 backdrop-blur-md border-t border-zinc-800 p-3.5 shadow-2xl">
        <div className="max-w-[1920px] mx-auto flex flex-col xl:flex-row items-center justify-between gap-4">
          
          {/* Leyenda de Secciones con sus colores y descripciones según el PDF */}
          <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-2 w-full xl:w-auto text-left">
            {mallaData.categorias.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(selectedCategory === cat.id ? 'all' : cat.id)}
                className={`p-2 rounded-xl border text-left transition flex items-start gap-2.5 ${
                  selectedCategory === cat.id
                    ? 'bg-zinc-800 border-white text-white ring-1 ring-white'
                    : 'bg-zinc-900/80 border-zinc-800 text-zinc-300 hover:border-zinc-600'
                }`}
                title={cat.descripcion}
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5 shadow-md"
                  style={{ backgroundColor: cat.colorHex }}
                />
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-white truncate leading-tight">
                    {cat.nombre}
                  </div>
                  <div className="text-[10px] text-zinc-400 line-clamp-1">
                    {cat.descripcion}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Estadísticas de Avance */}
          <div className="flex items-center gap-6 w-full xl:w-auto justify-between xl:justify-end border-t xl:border-t-0 pt-2 xl:pt-0 border-zinc-800">
            {/* Barra de Créditos */}
            <div className="flex flex-col gap-1 w-48 md:w-56">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-zinc-300">
                  Créditos: <span className="text-pink-400">{creditosAprobados}</span>/{totalCreditos}
                </span>
                <span className="text-pink-400 font-black">{porcentajeCreditos}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-zinc-800 overflow-hidden border border-zinc-700/60">
                <div
                  className="h-full bg-gradient-to-r from-pink-500 via-blue-500 to-emerald-400 transition-all duration-300"
                  style={{ width: `${porcentajeCreditos}%` }}
                />
              </div>
            </div>

            {/* Total Ramos */}
            <div className="text-right">
              <div className="text-[11px] text-zinc-400">Total Ramos</div>
              <div className="text-sm font-black text-white">
                {approved.length} <span className="text-xs font-normal text-zinc-400">/ {totalRamos} ({porcentajeRamos}%)</span>
              </div>
            </div>

            {/* Botón Limpiar */}
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition whitespace-nowrap"
              title="Reiniciar todos los ramos aprobados"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpiar</span>
            </button>
          </div>
        </div>
      </footer>

      {/* ================= MODAL DE DETALLE DEL RAMO ================= */}
      {selectedCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-700 max-w-md w-full rounded-2xl p-6 shadow-2xl relative text-left">
            <button
              onClick={() => setSelectedCourse(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono text-xs font-black text-pink-400 bg-pink-500/10 px-2 py-0.5 rounded border border-pink-500/30">
                {selectedCourse.codigo}
              </span>
              <span className="text-xs text-zinc-400">
                {selectedCourse.semestre}° Semestre • Año {selectedCourse.ano}
              </span>
            </div>

            <h3 className="text-lg font-bold text-white mb-2">
              {selectedCourse.nombre}
            </h3>

            <p className="text-xs text-zinc-300 mb-4 bg-zinc-950 p-3 rounded-xl border border-zinc-800">
              {selectedCourse.descripcion}
            </p>

            <div className="space-y-3 text-xs mb-5">
              {selectedCourse.campoClinico && (
                <div className="flex items-center gap-2 text-amber-300 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/30 font-semibold">
                  <Star className="w-4 h-4 fill-amber-400" />
                  <span>Posee componente obligatorio de Campo Clínico.</span>
                </div>
              )}

              {/* Prerrequisitos */}
              <div>
                <h4 className="font-bold text-zinc-300 mb-1">Prerrequisitos necesarios:</h4>
                {selectedCourse.prerrequisitos.length === 0 ? (
                  <span className="text-zinc-500 italic text-[11px]">No tiene prerrequisitos previos.</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {selectedCourse.prerrequisitos.map(reqId => {
                      const reqCourse = courseMap.get(reqId);
                      const isReqApp = approved.includes(reqId);
                      return (
                        <span
                          key={reqId}
                          className={`px-2 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 ${
                            isReqApp
                              ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
                              : 'bg-red-950/60 border-red-500 text-red-300'
                          }`}
                        >
                          {isReqApp ? <CheckCircle2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                          {reqCourse ? reqCourse.nombre : reqId}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Co-requisitos ligados */}
              {selectedCourse.correquisitos && selectedCourse.correquisitos.length > 0 && (
                <div>
                  <h4 className="font-bold text-rose-300 mb-1">Co-requisitos ligados (Línea roja punteada):</h4>
                  <p className="text-[11px] text-zinc-400 mb-1">
                    Estos ramos deben ser cursados obligatoriamente al mismo tiempo:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCourse.correquisitos.map(coId => {
                      const coCourse = courseMap.get(coId);
                      return (
                        <span
                          key={coId}
                          className="px-2 py-1 rounded-lg text-[11px] font-bold bg-rose-950/60 border border-rose-500 text-rose-300 flex items-center gap-1"
                        >
                          <LinkIcon className="w-3 h-3" />
                          {coCourse ? coCourse.nombre : coId}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Ramos que desbloquea */}
              <div>
                <h4 className="font-bold text-zinc-300 mb-1">Ramos que desbloquea a futuro:</h4>
                {(!directDependents.get(selectedCourse.id) || directDependents.get(selectedCourse.id).length === 0) ? (
                  <span className="text-zinc-500 italic text-[11px]">No tiene ramos dependientes posteriores.</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {directDependents.get(selectedCourse.id).map(futId => {
                      const futCourse = courseMap.get(futId);
                      return (
                        <span
                          key={futId}
                          className="px-2 py-1 rounded-lg text-[11px] font-medium bg-purple-950/60 border border-purple-500 text-purple-300 flex items-center gap-1"
                        >
                          <ArrowRight className="w-3 h-3" />
                          {futCourse ? futCourse.nombre : futId}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                handleToggleCourse(selectedCourse);
                setSelectedCourse(null);
              }}
              className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                approved.includes(selectedCourse.id)
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {approved.includes(selectedCourse.id) ? (
                <>Desmarcar como Aprobado</>
              ) : (
                <>Marcar como Aprobado (+ Requisitos)</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ================= MODAL DE SIMBOLOGÍA Y GUÍA ================= */}
      {showModalInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-700 max-w-lg w-full rounded-2xl p-6 shadow-2xl relative text-left">
            <button
              onClick={() => setShowModalInfo(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-pink-400" />
              Simbología y Reglas de la Malla ENF UNAB
            </h3>
            <p className="text-xs text-zinc-400 mb-4">
              Extraído fielmente de la guía oficial de requisitos y co-requisitos.
            </p>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex gap-3 items-start">
                <div className="w-3.5 h-3.5 rounded-full bg-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-white">Líneas sólidas (Progresión normal de ramos)</h4>
                  <p className="text-zinc-400 text-[11px] mt-0.5">
                    El ramo de origen debe ser aprobado para desbloquear el ramo donde termina la flecha.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/50 flex gap-3 items-start">
                <LinkIcon className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-rose-300">Líneas rojas punteadas (Ramos Ligados / Co-requisitos)</h4>
                  <p className="text-zinc-300 text-[11px] mt-0.5">
                    <strong>Deben ser tomados al mismo tiempo</strong> (NO se puede tomar solo uno). Por ejemplo, los ramos disciplinares e integradores en 4° y 5° semestre.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/50 flex gap-3 items-start">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-300">Ramo con Estrella en esquina superior derecha</h4>
                  <p className="text-zinc-300 text-[11px] mt-0.5">
                    Significa que el ramo posee componente obligatorio de <strong>campo clínico</strong> asistencial.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <h4 className="font-bold text-white mb-1.5">Colores de las Flechas Interactivas:</h4>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5 text-pink-400 font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full bg-pink-500" /> Ciencias Biomédicas
                  </div>
                  <div className="flex items-center gap-1.5 text-blue-400 font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Disciplinar Enfermería
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Farmacología
                  </div>
                  <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" /> Salud Pública y Gestión
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> General e Inglés
                  </div>
                  <div className="flex items-center gap-1.5 text-rose-400 font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Co-requisitos Ligados
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowModalInfo(false)}
              className="mt-5 w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* ================= MODAL DE APROBACIÓN RÁPIDA ================= */}
      {showFastApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-700 max-w-md w-full rounded-2xl p-6 shadow-2xl relative text-left">
            <button
              onClick={() => setShowFastApproveModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-400" />
              Aprobación Rápida de Semestres
            </h3>
            <p className="text-xs text-zinc-400 mb-4">
              Selecciona hasta qué semestre deseas marcar como aprobado con un solo clic:
            </p>

            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(sem => (
                <button
                  key={sem}
                  onClick={() => handleApproveUntilSemester(sem)}
                  className="p-3 rounded-xl bg-zinc-950 hover:bg-blue-600 hover:text-white border border-zinc-800 text-xs font-bold text-zinc-200 transition text-left flex items-center justify-between"
                >
                  <span>Hasta Semestre {sem}</span>
                  <span className="text-[10px] text-zinc-400">Año {Math.ceil(sem / 2)}</span>
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
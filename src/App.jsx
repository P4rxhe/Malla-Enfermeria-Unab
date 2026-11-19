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
  Award,
  BookOpen,
  Filter,
  Sparkles,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  X
} from 'lucide-react';
import mallaData from './data/mallaEnfermeria.json';

const STORAGE_KEY = 'malla_enfermeria_unab_aprobados_v1';

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
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [onlyClinics, setOnlyClinics] = useState(false);
  const [search, setSearch] = useState('');
  const [showModalInfo, setShowModalInfo] = useState(false);
  const [showFastApproveModal, setShowFastApproveModal] = useState(false);
  const [activeSemFilter, setActiveSemFilter] = useState('all'); // Para vista mobile
  const scrollContainerRef = useRef(null);

  // Guardar en localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(approved));
    } catch (e) {
      console.error('Error guardando en localStorage', e);
    }
  }, [approved]);

  // Mapa rápido de ramos por id
  const courseMap = useMemo(() => {
    const map = new Map();
    mallaData.ramos.forEach(r => map.set(r.id, r));
    return map;
  }, []);

  // Total de créditos y ramos
  const totalCreditos = mallaData.totalCreditos;
  const totalRamos = mallaData.ramos.length;

  // Créditos aprobados actuales
  const creditosAprobados = useMemo(() => {
    return approved.reduce((sum, id) => {
      const c = courseMap.get(id);
      return sum + (c?.creditos || 0);
    }, 0);
  }, [approved, courseMap]);

  const porcentajeCreditos = Math.round((creditosAprobados / totalCreditos) * 100);
  const porcentajeRamos = Math.round((approved.length / totalRamos) * 100);

  // Efecto de graduación al completar
  useEffect(() => {
    if (approved.length === totalRamos && totalRamos > 0) {
      confetti({
        particleCount: 120,
        spread: 90,
        origin: { y: 0.6 }
      });
    }
  }, [approved.length, totalRamos]);

  // Determinar si un ramo está desbloqueado (sus prerrequisitos están aprobados)
  const isUnlocked = (course) => {
    if (!course.prerrequisitos || course.prerrequisitos.length === 0) return true;
    return course.prerrequisitos.every(reqId => approved.includes(reqId));
  };

  // Dependencias de un ramo (quién depende de él hacia el futuro)
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

  // Obtener todos los dependientes recursivos para desmarcar en cascada si se desaprueba
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

  // Obtener todos los ancestros (prerrequisitos recursivos)
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

  // Toggle de aprobación de ramo
  const handleToggleCourse = (course) => {
    const isApproved = approved.includes(course.id);

    if (isApproved) {
      // Desmarcar este ramo y todos los ramos aprobados que dependan de él
      const dependentIds = getAllDescendants(course.id);
      const toRemove = [course.id, ...dependentIds.filter(id => approved.includes(id))];
      setApproved(prev => prev.filter(id => !toRemove.includes(id)));
    } else {
      // Marcar como aprobado
      // Si tiene correquisitos ligados (línea roja punteada), sugerir o incluir
      const toAdd = [course.id];
      // Si el usuario aprueba un ramo directamente, también auto-aprobamos sus prerrequisitos faltantes
      const missingAncestors = getAllAncestors(course.id).filter(id => !approved.includes(id));
      
      // Correquisitos ligados (líneas rojas punteadas)
      if (course.correquisitos && course.correquisitos.length > 0) {
        course.correquisitos.forEach(coReqId => {
          if (!approved.includes(coReqId) && !toAdd.includes(coReqId)) {
            toAdd.push(coReqId);
          }
        });
      }

      setApproved(prev => [...new Set([...prev, ...toAdd, ...missingAncestors])]);
    }
  };

  // Limpiar todos los ramos
  const handleClear = () => {
    if (window.confirm('¿Seguro que deseas reiniciar todos los ramos aprobados?')) {
      setApproved([]);
    }
  };

  // Aprobación rápida hasta semestre X
  const handleApproveUntilSemester = (targetSemester) => {
    const targetCourses = mallaData.ramos
      .filter(r => r.semestre <= targetSemester)
      .map(r => r.id);
    setApproved(prev => [...new Set([...prev, ...targetCourses])]);
    setShowFastApproveModal(false);
  };

  // Relaciones del ramo en hover
  const hoverRelationships = useMemo(() => {
    if (!hoveredCourseId) return null;
    const current = courseMap.get(hoveredCourseId);
    if (!current) return null;

    const prereqs = new Set(current.prerrequisitos || []);
    const coreqs = new Set(current.correquisitos || []);
    const unlocks = new Set(directDependents.get(hoveredCourseId) || []);

    return { prereqs, coreqs, unlocks };
  }, [hoveredCourseId, courseMap, directDependents]);

  // Agrupar semestres por años (Año 1 a 5)
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

  // Desplazamiento horizontal con botones
  const scrollHorizontally = (direction) => {
    if (scrollContainerRef.current) {
      const scrollAmount = direction === 'left' ? -380 : 380;
      scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none pb-36">
      
      {/* ================= BARRA SUPERIOR ================= */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 shadow-md">
        <div className="max-w-[1920px] mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          
          {/* Logo y Título */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 via-indigo-600 to-teal-400 flex items-center justify-center text-xl shadow-lg shadow-blue-900/40 border border-blue-400/30">
              🩺
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg md:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  Malla Interactiva Enfermería
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    UNAB
                  </span>
                </h1>
              </div>
              <p className="text-xs text-slate-400">
                10 Semestres • Plan de Estudios UNAB • Prerrequisitos, Co-requisitos y Campos Clínicos
              </p>
            </div>
          </div>

          {/* Buscador y Controles Rápidos */}
          <div className="flex items-center flex-wrap gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar ramo o código..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-slate-950/80 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-44 md:w-56"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filtro Sólo Campos Clínicos */}
            <button
              onClick={() => setOnlyClinics(!onlyClinics)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                onlyClinics
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/20'
                  : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>Clínicas</span>
            </button>

            {/* Aprobación Rápida */}
            <button
              onClick={() => setShowFastApproveModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700 transition"
              title="Aprobar hasta cierto semestre"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Aprobación Rápida</span>
            </button>

            {/* Simbología / Guía */}
            <button
              onClick={() => setShowModalInfo(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700 transition"
            >
              <HelpCircle className="w-3.5 h-3.5 text-teal-400" />
              <span>Simbología</span>
            </button>

            {/* Botón scroll izq/der para escritorio */}
            <div className="hidden lg:flex items-center gap-1 ml-2 border-l border-slate-700 pl-2">
              <button
                onClick={() => scrollHorizontally('left')}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                title="Desplazar a la izquierda"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => scrollHorizontally('right')}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                title="Desplazar a la derecha"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filtro de Semestres Móvil */}
        <div className="md:hidden flex items-center gap-1.5 overflow-x-auto px-4 py-2 border-t border-slate-800/60 no-scrollbar">
          <button
            onClick={() => setActiveSemFilter('all')}
            className={`px-2.5 py-1 rounded text-xs whitespace-nowrap ${
              activeSemFilter === 'all'
                ? 'bg-blue-600 text-white font-bold'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            Todos
          </button>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(num => (
            <button
              key={num}
              onClick={() => setActiveSemFilter(num)}
              className={`px-2.5 py-1 rounded text-xs whitespace-nowrap ${
                activeSemFilter === num
                  ? 'bg-blue-600 text-white font-bold'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              Sem {num}
            </button>
          ))}
        </div>
      </header>

      {/* ================= CONTENEDOR DE LA MALLA ================= */}
      <main className="flex-1 overflow-x-auto overflow-y-visible px-4 py-6" ref={scrollContainerRef}>
        <div className="inline-flex gap-4 min-w-max pb-8">
          
          {semesters.map(({ semestre, courses }) => {
            // Filtrado para móviles
            if (activeSemFilter !== 'all' && activeSemFilter !== semestre) return null;

            // Año al que pertenece el semestre
            const ano = Math.ceil(semestre / 2);
            const totalSemCreds = courses.reduce((s, c) => s + c.creditos, 0);
            const semAprobadosCount = courses.filter(c => approved.includes(c.id)).length;

            return (
              <div
                key={semestre}
                className="w-72 flex-shrink-0 flex flex-col bg-slate-900/60 rounded-2xl border border-slate-800/80 p-3 shadow-xl backdrop-blur-sm transition-all hover:border-slate-700"
              >
                {/* Cabecera del Semestre */}
                <div className="mb-3 pb-2.5 border-b border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400">
                      Año {ano}
                    </span>
                    <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                      {semestre}° Semestre
                    </h2>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-semibold text-slate-400 block">
                      {totalSemCreds} Créditos
                    </span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      semAprobadosCount === courses.length && courses.length > 0
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {semAprobadosCount}/{courses.length}
                    </span>
                  </div>
                </div>

                {/* Lista de Ramos del Semestre */}
                <div className="flex flex-col gap-2.5">
                  {courses.length === 0 ? (
                    <div className="p-6 text-center text-slate-600 text-xs italic">
                      Sin ramos con los filtros activos
                    </div>
                  ) : (
                    courses.map(course => {
                      const isApp = approved.includes(course.id);
                      const unlocked = isUnlocked(course);
                      const isHovered = hoveredCourseId === course.id;

                      // Relaciones de hover
                      const isPrereqOfHovered = hoverRelationships?.prereqs.has(course.id);
                      const isCoreqOfHovered = hoverRelationships?.coreqs.has(course.id);
                      const isUnlockedByHovered = hoverRelationships?.unlocks.has(course.id);

                      // Estilos de categorías
                      const catConfig = mallaData.categorias.find(c => c.id === course.categoria);

                      // Borde dinámico según relación con hover
                      let relationStyle = '';
                      if (isHovered) {
                        relationStyle = 'ring-2 ring-blue-400 shadow-xl shadow-blue-500/30 scale-[1.02] z-20';
                      } else if (isPrereqOfHovered) {
                        relationStyle = 'ring-2 ring-emerald-400 bg-emerald-950/60 border-emerald-500 animate-pulse-subtle z-10';
                      } else if (isCoreqOfHovered) {
                        relationStyle = 'ring-2 ring-rose-500 bg-rose-950/60 border-rose-500 animate-pulse-subtle z-10';
                      } else if (isUnlockedByHovered) {
                        relationStyle = 'ring-2 ring-purple-400 bg-purple-950/60 border-purple-500 animate-pulse-subtle z-10';
                      }

                      return (
                        <div
                          key={course.id}
                          onClick={() => handleToggleCourse(course)}
                          onMouseEnter={() => setHoveredCourseId(course.id)}
                          onMouseLeave={() => setHoveredCourseId(null)}
                          className={`
                            relative group p-3 rounded-xl border transition-all duration-150 cursor-pointer text-left
                            ${isApp 
                              ? 'bg-slate-900/90 border-slate-700/60 text-slate-400 opacity-65 hover:opacity-100 hover:border-slate-500 line-through-label' 
                              : unlocked 
                                ? `${catConfig?.bgLight || 'bg-slate-800/80 border-slate-700'} hover:border-blue-400/80 hover:shadow-lg hover:shadow-slate-900` 
                                : 'bg-slate-950/60 border-slate-800/60 text-slate-500 hover:border-slate-700'
                            }
                            ${relationStyle}
                          `}
                        >
                          {/* Top Card: Código + Créditos + Iconos */}
                          <div className="flex items-center justify-between gap-1 mb-1.5">
                            <span className="font-mono text-[11px] font-bold text-slate-300 tracking-wide">
                              {course.codigo}
                            </span>

                            <div className="flex items-center gap-1.5">
                              {/* Estrella de Campo Clínico */}
                              {course.campoClinico && (
                                <span
                                  className="text-amber-400 flex items-center"
                                  title="Ramo con componente de Campo Clínico"
                                >
                                  <Star className="w-3.5 h-3.5 fill-amber-400" />
                                </span>
                              )}

                              {/* Icono de Correquisito / Ramos Ligados (Línea roja punteada) */}
                              {course.correquisitos && course.correquisitos.length > 0 && (
                                <span
                                  className="text-rose-400 flex items-center"
                                  title={`Ramo ligado por co-requisito con: ${course.correquisitos.join(', ')}`}
                                >
                                  <LinkIcon className="w-3.5 h-3.5" />
                                </span>
                              )}

                              {/* Créditos */}
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-800/90 text-slate-300 border border-slate-700/50">
                                {course.creditos} cr
                              </span>
                            </div>
                          </div>

                          {/* Nombre del Ramo */}
                          <div className={`text-xs font-semibold leading-snug mb-2 ${isApp ? 'line-through text-slate-400' : 'text-slate-100'}`}>
                            {course.nombre}
                          </div>

                          {/* Estado inferior de prerrequisitos / candado */}
                          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-800/50">
                            <div className="flex items-center gap-1">
                              {isApp ? (
                                <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                                  <CheckCircle2 className="w-3 h-3" /> Aprobado
                                </span>
                              ) : unlocked ? (
                                <span className="inline-flex items-center gap-1 text-teal-400 font-medium">
                                  <Unlock className="w-3 h-3" /> Disponible
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                                  <Lock className="w-3 h-3 text-slate-500" /> Bloqueado
                                </span>
                              )}
                            </div>

                            {/* Indicadores numéricos de dependencias */}
                            {course.prerrequisitos.length > 0 && (
                              <div className="flex items-center gap-0.5" title={`Prerrequisitos: ${course.prerrequisitos.join(', ')}`}>
                                <span className="text-[9px] text-slate-500">Req:</span>
                                {course.prerrequisitos.map(reqId => (
                                  <span
                                    key={reqId}
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      approved.includes(reqId) ? 'bg-emerald-400' : 'bg-red-400'
                                    }`}
                                  />
                                ))}
                              </div>
                            )}
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
      </main>

      {/* ================= BARRA INFERIOR FLOTANTE DE MÉTRICAS ================= */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 p-3 shadow-2xl">
        <div className="max-w-[1920px] mx-auto flex flex-col md:flex-row items-center justify-between gap-3 px-2">
          
          {/* Leyenda de Categorías */}
          <div className="hidden xl:flex items-center gap-3 overflow-x-auto text-[11px] text-slate-300">
            {mallaData.categorias.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(selectedCategory === cat.id ? 'all' : cat.id)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition ${
                  selectedCategory === cat.id
                    ? 'bg-slate-700 text-white font-bold ring-1 ring-slate-500'
                    : 'hover:bg-slate-800 text-slate-400'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${cat.badge}`} />
                <span>{cat.nombre}</span>
              </button>
            ))}
          </div>

          {/* Estadísticas de Avance */}
          <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-center">
            {/* Barra de progreso de créditos */}
            <div className="flex flex-col gap-1 w-full md:w-64">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-300">
                  Créditos: <span className="text-teal-400">{creditosAprobados}</span> / {totalCreditos}
                </span>
                <span className="text-teal-400">{porcentajeCreditos}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 via-teal-500 to-emerald-400 transition-all duration-300"
                  style={{ width: `${porcentajeCreditos}%` }}
                />
              </div>
            </div>

            {/* Total Ramos */}
            <div className="text-right whitespace-nowrap">
              <div className="text-xs text-slate-400">Total Ramos</div>
              <div className="text-sm font-bold text-slate-200">
                {approved.length} <span className="text-xs font-normal text-slate-400">de {totalRamos} ({porcentajeRamos}%)</span>
              </div>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition"
              title="Reiniciar todos los ramos aprobados"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpiar ramos</span>
            </button>
          </div>
        </div>
      </footer>

      {/* ================= MODAL DE SIMBOLOGÍA Y GUÍA ================= */}
      {showModalInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 max-w-lg w-full rounded-2xl p-6 shadow-2xl relative text-left">
            <button
              onClick={() => setShowModalInfo(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-teal-400" />
              Simbología de la Malla de Enfermería
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Reglas de requisitos según el documento oficial de Enfermería UNAB (Campus República / Toda la UNAB).
            </p>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex gap-3 items-start">
                <div className="w-4 h-4 rounded-full bg-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-slate-200">Líneas sólidas (Prerrequisitos normales)</h4>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    El ramo de origen debe estar completamente aprobado para poder tomar el ramo donde termina la línea.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/40 flex gap-3 items-start">
                <LinkIcon className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-rose-300">Líneas rojas punteadas (Ramos Ligados / Co-requisitos)</h4>
                  <p className="text-slate-300 text-[11px] mt-0.5">
                    Estos ramos <strong>deben cursarse al mismo tiempo</strong> de manera obligatoria (no se puede tomar solo uno). Por ejemplo: en 4° y 5° semestre entre los ramos disciplinares e Integrador I.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 flex gap-3 items-start">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-amber-300">Ramo con Estrella en esquina superior derecha</h4>
                  <p className="text-slate-300 text-[11px] mt-0.5">
                    Indica que el ramo posee componente obligatorio de <strong>campo clínico</strong> (centros asistenciales, hospitales y centros de salud familiar).
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <h4 className="font-semibold text-slate-200 mb-1">Efectos al pasar el cursor (Hover)</h4>
                <div className="grid grid-cols-2 gap-2 text-[11px] mt-2">
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded bg-emerald-500" /> Prerrequisitos previos
                  </div>
                  <div className="flex items-center gap-1.5 text-purple-400">
                    <span className="w-2.5 h-2.5 rounded bg-purple-500" /> Ramos que desbloquea
                  </div>
                  <div className="flex items-center gap-1.5 text-rose-400">
                    <span className="w-2.5 h-2.5 rounded bg-rose-500" /> Co-requisitos ligados
                  </div>
                  <div className="flex items-center gap-1.5 text-blue-400">
                    <span className="w-2.5 h-2.5 rounded bg-blue-500" /> Ramo seleccionado
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowModalInfo(false)}
              className="mt-5 w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* ================= MODAL DE APROBACIÓN RÁPIDA ================= */}
      {showFastApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 max-w-md w-full rounded-2xl p-6 shadow-2xl relative text-left">
            <button
              onClick={() => setShowFastApproveModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-400" />
              Aprobación Rápida de Semestres
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              ¿Vas en un año superior? Selecciona hasta qué semestre deseas marcar como aprobado con un solo clic:
            </p>

            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(sem => (
                <button
                  key={sem}
                  onClick={() => handleApproveUntilSemester(sem)}
                  className="p-2.5 rounded-xl bg-slate-950/80 hover:bg-blue-600 hover:text-white border border-slate-800 text-xs font-medium text-slate-300 transition text-left flex items-center justify-between"
                >
                  <span>Hasta Semestre {sem}</span>
                  <span className="text-[10px] text-slate-500">Año {Math.ceil(sem / 2)}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowFastApproveModal(false)}
              className="mt-4 w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
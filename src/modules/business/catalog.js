// Rubros de empresa y sus tipos.
//
// `layout` decide cómo se presenta el negocio (qué secciones tiene su página
// y qué ofrece): un hotel muestra habitaciones, una agencia paquetes, un
// restaurante su menú. La app tiene una copia de este catálogo con iconos y
// colores (lib/models/business.dart); los ids deben coincidir.
export const SECTORS = [
  {
    id: 'hospedaje',
    label: 'Hospedaje',
    layout: 'lodging',
    types: [
      { id: 'cadena_hotelera', label: 'Cadena hotelera' },
      { id: 'hotel_independiente', label: 'Hotel independiente' },
      { id: 'hostal', label: 'Hostal o residencial' },
      { id: 'apart_hotel', label: 'Apart-hotel' },
      { id: 'ecolodge', label: 'Eco-lodge o albergue' },
    ],
  },
  {
    id: 'turismo',
    label: 'Turismo',
    layout: 'tourism',
    types: [
      { id: 'agencia_viajes', label: 'Agencia de viajes' },
      { id: 'operador_turistico', label: 'Operador turístico' },
      { id: 'guias_turisticos', label: 'Empresa de guías turísticos' },
      { id: 'transporte_turistico', label: 'Transporte turístico' },
    ],
  },
  {
    id: 'gastronomia',
    label: 'Gastronomía',
    layout: 'food',
    types: [
      { id: 'restaurante', label: 'Restaurante' },
      { id: 'cafeteria', label: 'Cafetería' },
      { id: 'bar', label: 'Bar o peña folklórica' },
      { id: 'catering', label: 'Catering' },
    ],
  },
  {
    id: 'empresarial',
    label: 'Empresarial y servicios',
    layout: 'general',
    types: [
      { id: 'corporativo', label: 'Corporativo / gran empresa' },
      { id: 'pyme', label: 'Pequeña o mediana empresa' },
      { id: 'consultora', label: 'Consultora' },
      { id: 'estudio_profesional', label: 'Estudio profesional (legal, contable)' },
    ],
  },
  {
    id: 'tecnologia',
    label: 'Tecnología',
    layout: 'general',
    types: [
      { id: 'software', label: 'Desarrollo de software' },
      { id: 'telecomunicaciones', label: 'Telecomunicaciones' },
      { id: 'servicios_ti', label: 'Servicios de TI' },
    ],
  },
  {
    id: 'comercio',
    label: 'Comercio',
    layout: 'general',
    types: [
      { id: 'tienda', label: 'Tienda' },
      { id: 'supermercado', label: 'Supermercado' },
      { id: 'distribuidora', label: 'Distribuidora o mayorista' },
    ],
  },
  {
    id: 'construccion',
    label: 'Construcción',
    layout: 'general',
    types: [
      { id: 'constructora', label: 'Constructora' },
      { id: 'inmobiliaria', label: 'Inmobiliaria' },
    ],
  },
  {
    id: 'salud',
    label: 'Salud',
    layout: 'general',
    types: [
      { id: 'clinica', label: 'Clínica u hospital' },
      { id: 'farmacia', label: 'Farmacia' },
      { id: 'laboratorio', label: 'Laboratorio' },
    ],
  },
  {
    id: 'educacion',
    label: 'Educación',
    layout: 'general',
    types: [
      { id: 'universidad', label: 'Universidad o instituto' },
      { id: 'colegio', label: 'Colegio' },
      { id: 'centro_capacitacion', label: 'Centro de capacitación' },
    ],
  },
  {
    id: 'transporte',
    label: 'Transporte y logística',
    layout: 'general',
    types: [
      { id: 'transporte_pasajeros', label: 'Transporte de pasajeros' },
      { id: 'logistica', label: 'Logística y carga' },
    ],
  },
  {
    id: 'industria',
    label: 'Industria y producción',
    layout: 'general',
    types: [
      { id: 'manufactura', label: 'Manufactura' },
      { id: 'agroindustria', label: 'Agroindustria' },
      { id: 'mineria', label: 'Minería' },
    ],
  },
  {
    id: 'otro',
    label: 'Otro rubro',
    layout: 'general',
    types: [{ id: 'otro', label: 'Otro' }],
  },
];

export const sectorById = (id) => SECTORS.find((s) => s.id === id);

export const isValidType = (sectorId, typeId) =>
  Boolean(sectorById(sectorId)?.types.some((t) => t.id === typeId));

/**
 * Qué se ofrece en cada presentación. Los profesionales y técnicos también
 * ofrecen: talleres (artesanos), tours (guías) o servicios.
 */
export const OFFERING_KINDS = {
  lodging: ['room'],
  tourism: ['package'],
  food: ['dish'],
  general: ['service'],
  professional: ['workshop', 'tour', 'service'],
};
export const ALL_OFFERING_KINDS = ['room', 'package', 'dish', 'service', 'workshop', 'tour'];

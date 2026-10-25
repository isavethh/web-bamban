import { z } from 'zod';

import { isValidType } from '../business/catalog.js';

export const ROLES = ['seeker', 'serviceSeeker', 'employer', 'tourist'];

const text = (max) => z.string().trim().max(max);
const optionalText = (max) => text(max).nullish();
const list = (max = 50) => z.array(z.string().trim().min(1).max(300)).max(max).nullish();

// ~1,5 MB en base64: la foto ya llega reducida desde la app.
const photo = z.string().max(2_000_000, 'La foto es demasiado grande.').nullish();

export const email = z.string().trim().toLowerCase().email('Correo inválido.').max(254);
export const password = z
  .string()
  .min(6, 'La contraseña debe tener al menos 6 caracteres.')
  .max(128);

/** Campos que la persona puede editar de su propio perfil. */
export const profileFields = {
  name: text(150).min(1, 'Escribe tu nombre.'),
  phoneIntl: optionalText(30),
  city: optionalText(120),
  department: optionalText(60),
  province: optionalText(120),
  photoBase64: photo,
  career: optionalText(150),
  specialty: optionalText(150),
  summary: optionalText(2000),
  languages: list(),
  certificates: list(),
  skills: list(),
  experiences: list(),
  serviceCategories: list(),
  previousWorks: list(),
  isProfilePublic: z.boolean(),
  companyName: optionalText(150),
  taxId: optionalText(30),
};

export const registerBody = z
  .object({
    ...profileFields,
    email,
    password,
    role: z.enum(ROLES),
    isProfilePublic: profileFields.isProfilePublic.optional(),
    // Solo empresas: rubro y tipo (ver business/catalog.js).
    businessSector: z.string().max(40).nullish(),
    businessType: z.string().max(40).nullish(),
  })
  .superRefine((data, ctx) => {
    if (data.role !== 'employer') return;
    if (!data.businessSector || !data.businessType) {
      ctx.addIssue({
        code: 'custom',
        path: ['businessSector'],
        message: 'Elige el rubro de la empresa.',
      });
    } else if (!isValidType(data.businessSector, data.businessType)) {
      ctx.addIssue({
        code: 'custom',
        path: ['businessType'],
        message: 'El tipo no corresponde al rubro.',
      });
    }
  });

export const loginBody = z.object({ email, password: z.string().min(1).max(128) });

export const demoBody = z.object({ role: z.enum(ROLES) });

// Los campos que no son editables (id, rol, calificación, verificación...)
// se descartan en silencio: la app envía el perfil completo.
export const updateProfileBody = z.object({ ...profileFields, email }).partial();

export const changePasswordBody = z.object({
  oldPassword: z.string().min(1).max(128),
  newPassword: password,
});

export const listProfilesQuery = z.object({ role: z.enum(ROLES).optional() });

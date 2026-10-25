import { sql, one, rows, query } from '../../db/pool.js';
import { parseJson } from '../../lib/text.js';

// Campos de lista que viven en la columna JSON `details`.
export const DETAIL_FIELDS = [
  'languages',
  'certificates',
  'skills',
  'experiences',
  'serviceCategories',
  'previousWorks',
  'reviews',
];

// Nombre en la API → columna.
const COLUMNS = {
  name: 'name',
  email: 'email',
  phoneIntl: 'phone',
  city: 'city',
  department: 'department',
  province: 'province',
  photoBase64: 'photo',
  career: 'career',
  specialty: 'specialty',
  summary: 'summary',
  companyName: 'company_name',
  taxId: 'tax_id',
  isProfilePublic: 'is_profile_public',
};

/** Fila de `users` → perfil con la forma de `UserProfile` del frontend. */
export function toProfile(row, { includePrivate = true } = {}) {
  const details = parseJson(row.details, {});
  const profile = {
    id: row.id,
    role: row.role,
    name: row.name,
    email: row.email,
    phoneIntl: row.phone,
    city: row.city,
    department: row.department,
    province: row.province,
    photoBase64: row.photo,
    career: row.career,
    specialty: row.specialty,
    summary: row.summary,
    isProfilePublic: Boolean(row.is_profile_public),
    rating: row.rating === null ? null : Number(row.rating),
    companyName: row.company_name,
    taxId: row.tax_id,
    isEmployerVerified: Boolean(row.is_employer_verified),
  };
  for (const f of DETAIL_FIELDS) profile[f] = details[f] ?? null;
  // Rubro y tipo de la empresa (vienen de business_profiles).
  profile.businessSector = row.business_sector ?? null;
  profile.businessType = row.business_type ?? null;
  if (!includePrivate) delete profile.taxId;
  return profile;
}

const USER_SELECT = `
  SELECT u.*, b.sector AS business_sector, b.business_type
  FROM users u LEFT JOIN business_profiles b ON b.user_id = u.id`;

export const findById = (id, executor) => one(`${USER_SELECT} WHERE u.id = @id`, { id }, executor);

export const findByEmail = (email, executor) =>
  one(`${USER_SELECT} WHERE u.email = @email`, { email }, executor);

export async function insertUser(user, executor) {
  await query(
    `INSERT INTO users (id, email, password_hash, role, name, phone, city, department, province,
       photo, career, specialty, summary, company_name, tax_id, is_employer_verified,
       is_profile_public, rating, details, is_demo)
     VALUES (@id, @email, @passwordHash, @role, @name, @phone, @city, @department, @province,
       @photo, @career, @specialty, @summary, @companyName, @taxId, @verified,
       @isPublic, @rating, @details, @isDemo)`,
    {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role,
      name: user.name,
      phone: user.phoneIntl ?? null,
      city: user.city ?? null,
      department: user.department ?? null,
      province: user.province ?? null,
      photo: [sql.NVarChar(sql.MAX), user.photoBase64 ?? null],
      career: user.career ?? null,
      specialty: user.specialty ?? null,
      summary: user.summary ?? null,
      companyName: user.companyName ?? null,
      taxId: user.taxId ?? null,
      verified: [sql.Bit, Boolean(user.isEmployerVerified)],
      isPublic: [sql.Bit, user.isProfilePublic ?? true],
      rating: [sql.Decimal(3, 2), user.rating ?? null],
      details: [sql.NVarChar(sql.MAX), JSON.stringify(pickDetails(user))],
      isDemo: [sql.Bit, Boolean(user.isDemo)],
    },
    executor,
  );
}

function pickDetails(source, base = {}) {
  const details = { ...base };
  for (const f of DETAIL_FIELDS) if (source[f] !== undefined) details[f] = source[f];
  return details;
}

/** Actualiza solo los campos presentes en `changes`. */
export async function updateUser(id, changes) {
  const current = await findById(id);
  if (!current) return null;
  const sets = [];
  const params = { id };
  for (const [field, column] of Object.entries(COLUMNS)) {
    if (changes[field] === undefined) continue;
    sets.push(`${column} = @${field}`);
    params[field] =
      field === 'photoBase64'
        ? [sql.NVarChar(sql.MAX), changes[field]]
        : field === 'isProfilePublic'
          ? [sql.Bit, changes[field]]
          : changes[field];
  }
  if (DETAIL_FIELDS.some((f) => changes[f] !== undefined)) {
    sets.push('details = @details');
    params.details = [
      sql.NVarChar(sql.MAX),
      JSON.stringify(pickDetails(changes, parseJson(current.details, {}))),
    ];
  }
  if (sets.length) {
    sets.push('updated_at = SYSUTCDATETIME()');
    await query(`UPDATE users SET ${sets.join(', ')} WHERE id = @id`, params);
  }
  return findById(id);
}

export const updatePassword = (id, passwordHash) =>
  query(
    'UPDATE users SET password_hash = @passwordHash, updated_at = SYSUTCDATETIME() WHERE id = @id',
    { id, passwordHash },
  );

export const listPublic = (role) =>
  rows(
    `${USER_SELECT}
     WHERE u.is_profile_public = 1 AND (@role IS NULL OR u.role = @role)
     ORDER BY u.rating DESC, u.name`,
    { role: role ?? null },
  );

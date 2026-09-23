import fs from 'fs';

const path = 'app/services/users.ts';
let s = fs.readFileSync(path, 'utf8');

const oldFn = `export async function updateAccountSettings(
  patch: Partial<Pick<AccountSettings, 'email' | 'birthDate'>>,
): Promise<{ account: AccountSettings | null; message?: string }> {
  try {
    const res = await authFetch(\`\${API_BASE}/api/users/me/account\`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.data) {
      const data = json.data;
      return {
        account: {
          phone: typeof data.phone === 'string' ? data.phone : data.phone ?? null,
          email: typeof data.email === 'string' ? data.email : data.email ?? null,
          birthDate:
            typeof data.birthDate === 'string' ? data.birthDate : data.birthDate ?? null,
        },
      };
    }
    return {
      account: null,
      message: json.messageAr ?? json.message ?? 'تعذّr حفظ البيانات',
    };
  } catch {
    return { account: null, message: 'تعذّr الاتصال بالخادم' };
  }
}`;

const newFn = `export async function updateAccountSettings(
  patch: Partial<Pick<AccountSettings, 'email' | 'birthDate'>>,
  userId?: string,
): Promise<{ account: AccountSettings | null; message?: string }> {
  const toAccount = (data: unknown): AccountSettings | null => {
    if (!data || typeof data !== 'object') return null;
    const row = data as Record<string, unknown>;
    return {
      phone: typeof row.phone === 'string' ? row.phone : row.phone ?? null,
      email: typeof row.email === 'string' ? row.email : row.email ?? null,
      birthDate:
        typeof row.birthDate === 'string' ? row.birthDate : row.birthDate ?? null,
    };
  };

  try {
    const res = await authFetch(\`\${API_BASE}/api/users/me/account\`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const json = await res.json().catch(() => ({}));
    const account = toAccount(json.data);
    if (res.ok && account) return { account };
    if (!userId) {
      return {
        account: null,
        message: json.messageAr ?? json.message ?? 'تعذّr حفظ البيانات',
      };
    }
  } catch {
    if (!userId) return { account: null, message: 'تعذّr الاتصال بالخادم' };
  }

  if (!userId) return { account: null, message: 'تعذّr حفظ البيانات' };

  try {
    const res = await authFetch(\`\${API_BASE}/api/users/\${encodeURIComponent(userId)}\`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const json = await res.json().catch(() => ({}));
    const account = toAccount(json.data);
    if (res.ok && account) return { account };
    return {
      account: null,
      message: json.messageAr ?? json.message ?? 'تعذّr حفظ البيانات',
    };
  } catch {
    return { account: null, message: 'تعذّr الاتصال بالخادم' };
  }
}`;

if (!s.includes(oldFn)) {
  console.error('old block not found');
  process.exit(1);
}
s = s.replace(oldFn, newFn);
fs.writeFileSync(path, s);
console.log('users.ts updated');

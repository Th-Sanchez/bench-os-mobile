import { Platform } from 'react-native';
import {
  Contact,
  ContactField,
  ContactsSortOrder,
  requestPermissionsAsync,
} from 'expo-contacts';
import { maskPhoneBR, unmaskDigits } from './masks';

export interface DeviceContactPhone {
  normalized: string;
  formatted: string;
  label?: string;
}

export interface DeviceContactEntry {
  id: string;
  name: string;
  phones: DeviceContactPhone[];
}

export type LoadDeviceContactsResult =
  | { status: 'granted'; contacts: DeviceContactEntry[] }
  | { status: 'denied'; canAskAgain: boolean; contacts: [] }
  | { status: 'unsupported'; contacts: [] };

/**
 * Normalizes Brazilian phone numbers stored in Android/iOS address books
 * (removing +55, 0055, carrier codes like 015/021/041, or leading trunk 0)
 * so imported contacts match BenchOS's standard 10/11-digit storage format.
 */
export function normalizeBrazilianContactPhone(raw: string): string {
  let digits = unmaskDigits(raw);
  if (!digits) return '';

  // International 0055 prefix
  if (digits.startsWith('0055') && digits.length >= 14) {
    digits = digits.slice(4);
  }
  // Brazilian +55 country code (12 = 55 + 10-digit landline, 13 = 55 + 11-digit mobile)
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  // Long-distance carrier prefix: 0 + 2-digit CSP + 10/11-digit DDD+number (13 or 14 digits)
  if (digits.startsWith('0') && (digits.length === 13 || digits.length === 14)) {
    digits = digits.slice(3);
  }
  // Trunk zero before DDD: 0 + 10/11-digit number (11 or 12 digits)
  if (digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }

  if (digits.length < 8 || digits.length > 15) {
    return '';
  }

  return digits;
}

export function formatContactPhoneDisplay(normalized: string): string {
  if (normalized.length === 10 || normalized.length === 11) {
    return maskPhoneBR(normalized);
  }
  return normalized;
}

export async function loadDeviceContacts(): Promise<LoadDeviceContactsResult> {
  if (Platform.OS === 'web') {
    return { status: 'unsupported', contacts: [] };
  }

  const permission = await requestPermissionsAsync();
  if (permission.status !== 'granted') {
    return {
      status: 'denied',
      canAskAgain: permission.canAskAgain ?? true,
      contacts: [],
    };
  }

  const rawContacts = await Contact.getAllDetails(
    [
      ContactField.FULL_NAME,
      ContactField.GIVEN_NAME,
      ContactField.FAMILY_NAME,
      ContactField.PHONES,
    ],
    {
      sortOrder: ContactsSortOrder.GivenName,
    }
  );

  const entries: DeviceContactEntry[] = [];

  for (let i = 0; i < rawContacts.length; i++) {
    const rawContact = rawContacts[i];
    const displayName = (
      rawContact.fullName ||
      [rawContact.givenName, rawContact.familyName].filter(Boolean).join(' ')
    ).trim();

    if (!displayName || !rawContact.phones?.length) {
      continue;
    }

    const seenForContact = new Set<string>();
    const phones: DeviceContactPhone[] = [];

    for (const phoneEntry of rawContact.phones) {
      const rawNumber = phoneEntry.number ?? '';
      const normalized = normalizeBrazilianContactPhone(rawNumber);
      if (!normalized || seenForContact.has(normalized)) {
        continue;
      }
      seenForContact.add(normalized);
      phones.push({
        normalized,
        formatted: formatContactPhoneDisplay(normalized),
        label: phoneEntry.label,
      });
    }

    if (phones.length === 0) {
      continue;
    }

    // Prefer 11-digit mobile numbers first (most common for WhatsApp)
    phones.sort((a, b) => {
      const aMobile = a.normalized.length === 11 && a.normalized[2] === '9' ? 0 : 1;
      const bMobile = b.normalized.length === 11 && b.normalized[2] === '9' ? 0 : 1;
      return aMobile - bMobile;
    });

    entries.push({
      id: rawContact.id || `contact-${i}`,
      name: displayName.slice(0, 120),
      phones,
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));

  return { status: 'granted', contacts: entries };
}

/** Major OTAs supported via Channex channel iframe. Codes match Channex channel codes. */
export type OtaCode = 'ABB' | 'BDC' | 'EXP' | 'VRB' | 'HWL'

export type Ota = {
  code: OtaCode
  name: string
  /** Brand accent for tile badges (not trademarked artwork). */
  color: string
}

export const OTAS: readonly Ota[] = [
  { code: 'ABB', name: 'Airbnb', color: '#FF5A5F' },
  { code: 'BDC', name: 'Booking.com', color: '#003580' },
  { code: 'EXP', name: 'Expedia', color: '#FFC72C' },
  { code: 'VRB', name: 'Vrbo', color: '#3B5998' },
  { code: 'HWL', name: 'Hostelworld', color: '#F36B21' },
] as const

export const OTA_CODES: readonly OtaCode[] = OTAS.map((o) => o.code)

export function isOtaCode(value: string): value is OtaCode {
  return (OTA_CODES as readonly string[]).includes(value)
}

export function otaByCode(code: string): Ota | undefined {
  return OTAS.find((o) => o.code === code)
}

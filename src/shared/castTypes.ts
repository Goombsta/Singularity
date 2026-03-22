export type CastDeviceType = 'chromecast' | 'dlna'

export interface CastDevice {
  id: string
  name: string
  type: CastDeviceType
  host: string
  port: number
}

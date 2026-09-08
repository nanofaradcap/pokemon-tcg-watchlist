import { z } from 'zod'
import { parseCardUrl } from './card-url'

export const cardUrlSchema = z.string().trim().max(2048).refine((url) => {
  try {
    parseCardUrl(url)
    return true
  } catch {
    return false
  }
}, 'Use an HTTPS TCGplayer product or PriceCharting card URL')

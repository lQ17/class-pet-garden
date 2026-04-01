export interface Class {
  id: string
  name: string
  created_at: number
}

export interface Student {
  id: string
  class_id: string
  name: string
  student_no: string | null
  total_points: number
  pet_type: string | null
  pet_level: number
  pet_exp: number
  pet_status?: 'alive' | 'injured' | 'dead'
}

export interface Rule {
  id: string
  name: string
  points: number
  category: string
  is_custom?: boolean
}

export interface EvaluationRecord {
  id: string
  class_id: string
  student_id: string
  student_name?: string
  points: number
  reason: string
  category: string
  timestamp: number
}

export interface EvaluationResult {
  id: string
  timestamp: number
  petLevel?: number
  petExp?: number
  petStatus?: 'alive' | 'injured' | 'dead'
  levelUp?: boolean
  levelDown?: boolean
  graduated?: boolean
  died?: boolean
  revived?: boolean
  injured?: boolean
  healed?: boolean
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Product {
  id: string
  user_id: string
  name: string
  description?: string
  price: number
  stock: number
  image_url?: string
  is_enabled: boolean
  sort_order: number
  created_at: number
  updated_at: number
}

export interface RedemptionRecord {
  id: string
  user_id: string
  student_id: string
  product_id: string
  product_name: string
  price: number
  redeemed_at: number
  student_name?: string
}

export interface Student {
  id: string
  class_id: string
  name: string
  student_no: string | null
  total_points: number
  usable_points: number
  pet_type: string | null
  pet_level: number
  pet_exp: number
  pet_status?: 'alive' | 'injured' | 'dead'
}

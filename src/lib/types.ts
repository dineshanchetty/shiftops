export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      aura_field_mappings: {
        Row: {
          branch_id: string | null
          created_at: string | null
          csv_column: string
          id: string
          shiftops_field: string
          tenant_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string | null
          csv_column: string
          id?: string
          shiftops_field: string
          tenant_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string | null
          csv_column?: string
          id?: string
          shiftops_field?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aura_field_mappings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aura_field_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      aura_imports: {
        Row: {
          branch_id: string
          created_at: string | null
          error_log: string | null
          id: string
          import_date: string | null
          parsed_at: string | null
          raw_data: Json | null
          source_file: string | null
          status: string | null
          tenant_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string | null
          error_log?: string | null
          id?: string
          import_date?: string | null
          parsed_at?: string | null
          raw_data?: Json | null
          source_file?: string | null
          status?: string | null
          tenant_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string | null
          error_log?: string | null
          id?: string
          import_date?: string | null
          parsed_at?: string | null
          raw_data?: Json | null
          source_file?: string | null
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aura_imports_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aura_imports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_payment_channels: {
        Row: {
          branch_id: string
          channel_name: string
          created_at: string | null
          id: string
          is_active: boolean | null
          sort_order: number | null
          tenant_id: string
        }
        Insert: {
          branch_id: string
          channel_name: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          sort_order?: number | null
          tenant_id: string
        }
        Update: {
          branch_id?: string
          channel_name?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          sort_order?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_payment_channels_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_payment_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          aura_export_path: string | null
          aura_ftp_host: string | null
          aura_ftp_pass_encrypted: string | null
          aura_ftp_user: string | null
          brand_id: string
          closing_time: string | null
          created_at: string | null
          id: string
          name: string
          opening_time: string | null
          tenant_id: string
          timezone: string | null
          working_days: string[] | null
        }
        Insert: {
          address?: string | null
          aura_export_path?: string | null
          aura_ftp_host?: string | null
          aura_ftp_pass_encrypted?: string | null
          aura_ftp_user?: string | null
          brand_id: string
          closing_time?: string | null
          created_at?: string | null
          id?: string
          name: string
          opening_time?: string | null
          tenant_id: string
          timezone?: string | null
          working_days?: string[] | null
        }
        Update: {
          address?: string | null
          aura_export_path?: string | null
          aura_ftp_host?: string | null
          aura_ftp_pass_encrypted?: string | null
          aura_ftp_user?: string | null
          brand_id?: string
          closing_time?: string | null
          created_at?: string | null
          id?: string
          name?: string
          opening_time?: string | null
          tenant_id?: string
          timezone?: string | null
          working_days?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          color_hex: string | null
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          tenant_id: string
        }
        Insert: {
          color_hex?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          tenant_id: string
        }
        Update: {
          color_hex?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cashup_driver_entries: {
        Row: {
          cashup_id: string
          charges: number | null
          delivery_count: number | null
          fuel_cost: number | null
          gratuities: number | null
          id: string
          staff_id: string
          turnover: number | null
          wages: number | null
        }
        Insert: {
          cashup_id: string
          charges?: number | null
          delivery_count?: number | null
          fuel_cost?: number | null
          gratuities?: number | null
          id?: string
          staff_id: string
          turnover?: number | null
          wages?: number | null
        }
        Update: {
          cashup_id?: string
          charges?: number | null
          delivery_count?: number | null
          fuel_cost?: number | null
          gratuities?: number | null
          id?: string
          staff_id?: string
          turnover?: number | null
          wages?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cashup_driver_entries_cashup_id_fkey"
            columns: ["cashup_id"]
            isOneToOne: false
            referencedRelation: "daily_cashups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashup_driver_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      cashup_expenses: {
        Row: {
          amount: number | null
          cashup_id: string
          category: string | null
          description: string | null
          id: string
        }
        Insert: {
          amount?: number | null
          cashup_id: string
          category?: string | null
          description?: string | null
          id?: string
        }
        Update: {
          amount?: number | null
          cashup_id?: string
          category?: string | null
          description?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashup_expenses_cashup_id_fkey"
            columns: ["cashup_id"]
            isOneToOne: false
            referencedRelation: "daily_cashups"
            referencedColumns: ["id"]
          },
        ]
      }
      cashup_online_payments: {
        Row: {
          amount: number | null
          cashup_id: string
          channel: string
          id: string
        }
        Insert: {
          amount?: number | null
          cashup_id: string
          channel: string
          id?: string
        }
        Update: {
          amount?: number | null
          cashup_id?: string
          channel?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashup_online_payments_cashup_id_fkey"
            columns: ["cashup_id"]
            isOneToOne: false
            referencedRelation: "daily_cashups"
            referencedColumns: ["id"]
          },
        ]
      }
      cashup_purchases: {
        Row: {
          amount: number | null
          cashup_id: string
          id: string
          item_type: string | null
        }
        Insert: {
          amount?: number | null
          cashup_id: string
          id?: string
          item_type?: string | null
        }
        Update: {
          amount?: number | null
          cashup_id?: string
          id?: string
          item_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cashup_purchases_cashup_id_fkey"
            columns: ["cashup_id"]
            isOneToOne: false
            referencedRelation: "daily_cashups"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_cashups: {
        Row: {
          aura_import_id: string | null
          branch_id: string
          cash_banked: number | null
          cc_batch_total: number | null
          comment: string | null
          created_at: string | null
          created_by: string | null
          credit_cards: number | null
          date: string
          debtors: number | null
          delivery_charges: number | null
          discounts: number | null
          drinks_stock_take: number | null
          gross_turnover: number | null
          id: string
          shop_float: number | null
          status: string | null
          stock_take: number | null
          submitted_at: string | null
          tenant_id: string
          tx_collect: number | null
          tx_count: number | null
          tx_delivery: number | null
        }
        Insert: {
          aura_import_id?: string | null
          branch_id: string
          cash_banked?: number | null
          cc_batch_total?: number | null
          comment?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_cards?: number | null
          date: string
          debtors?: number | null
          delivery_charges?: number | null
          discounts?: number | null
          drinks_stock_take?: number | null
          gross_turnover?: number | null
          id?: string
          shop_float?: number | null
          status?: string | null
          stock_take?: number | null
          submitted_at?: string | null
          tenant_id: string
          tx_collect?: number | null
          tx_count?: number | null
          tx_delivery?: number | null
        }
        Update: {
          aura_import_id?: string | null
          branch_id?: string
          cash_banked?: number | null
          cc_batch_total?: number | null
          comment?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_cards?: number | null
          date?: string
          debtors?: number | null
          delivery_charges?: number | null
          discounts?: number | null
          drinks_stock_take?: number | null
          gross_turnover?: number | null
          id?: string
          shop_float?: number | null
          status?: string | null
          stock_take?: number | null
          submitted_at?: string | null
          tenant_id?: string
          tx_collect?: number | null
          tx_count?: number | null
          tx_delivery?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_cashups_aura_import_id_fkey"
            columns: ["aura_import_id"]
            isOneToOne: false
            referencedRelation: "aura_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_cashups_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_cashups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          created_at: string | null
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_entries: {
        Row: {
          branch_id: string
          created_at: string | null
          date: string
          id: string
          is_off: boolean | null
          notes: string | null
          shift_end: string | null
          shift_hours: number | null
          shift_start: string | null
          staff_id: string
          tenant_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string | null
          date: string
          id?: string
          is_off?: boolean | null
          notes?: string | null
          shift_end?: string | null
          shift_hours?: number | null
          shift_start?: string | null
          staff_id: string
          tenant_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string | null
          date?: string
          id?: string
          is_off?: boolean | null
          notes?: string | null
          shift_end?: string | null
          shift_hours?: number | null
          shift_start?: string | null
          staff_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          active: boolean | null
          auth_user_id: string | null
          branch_id: string
          created_at: string | null
          email: string | null
          employment_type: string | null
          first_name: string
          id: string
          id_number: string | null
          last_name: string
          phone: string | null
          position_id: string | null
          start_date: string | null
          sub_position_id: string | null
          tenant_id: string
        }
        Insert: {
          active?: boolean | null
          auth_user_id?: string | null
          branch_id: string
          created_at?: string | null
          email?: string | null
          employment_type?: string | null
          first_name: string
          id?: string
          id_number?: string | null
          last_name: string
          phone?: string | null
          position_id?: string | null
          start_date?: string | null
          sub_position_id?: string | null
          tenant_id: string
        }
        Update: {
          active?: boolean | null
          auth_user_id?: string | null
          branch_id?: string
          created_at?: string | null
          email?: string | null
          employment_type?: string | null
          first_name?: string
          id?: string
          id_number?: string | null
          last_name?: string
          phone?: string | null
          position_id?: string | null
          start_date?: string | null
          sub_position_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_sub_position_id_fkey"
            columns: ["sub_position_id"]
            isOneToOne: false
            referencedRelation: "sub_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_positions: {
        Row: {
          created_at: string | null
          id: string
          name: string
          position_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          position_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          position_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_positions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_positions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          branch_ids: string[] | null
          created_at: string | null
          id: string
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          branch_ids?: string[] | null
          created_at?: string | null
          id?: string
          role: string
          tenant_id: string
          user_id: string
        }
        Update: {
          branch_ids?: string[] | null
          created_at?: string | null
          id?: string
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          billing_email: string | null
          brand_name: string | null
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          plan: string
          primary_color: string | null
          slug: string
          trial_ends_at: string | null
        }
        Insert: {
          billing_email?: string | null
          brand_name?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          plan?: string
          primary_color?: string | null
          slug: string
          trial_ends_at?: string | null
        }
        Update: {
          billing_email?: string | null
          brand_name?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          plan?: string
          primary_color?: string | null
          slug?: string
          trial_ends_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_branch_ids: { Args: Record<string, never>; Returns: string[] }
      get_user_role: { Args: Record<string, never>; Returns: string }
      get_user_tenant_id: { Args: Record<string, never>; Returns: string }
      setup_tenant: {
        Args: {
          p_branch_address?: string
          p_branch_brand: string
          p_branch_name: string
          p_brands: string[]
          p_name: string
          p_slug: string
          p_user_id: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// ─── Convenience type helpers ───────────────────────────────────────────────

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]

// ─── Named Row types for convenience ────────────────────────────────────────

export type Tenant = Tables<"tenants">
export type Brand = Tables<"brands">
export type Branch = Tables<"branches">
export type Staff = Tables<"staff">
export type Position = Tables<"positions">
export type SubPosition = Tables<"sub_positions">
export type TenantMember = Tables<"tenant_members">
export type RosterEntry = Tables<"roster_entries">
export type DailyCashup = Tables<"daily_cashups">
export type CashupOnlinePayment = Tables<"cashup_online_payments">
export type CashupDriverEntry = Tables<"cashup_driver_entries">
export type CashupExpense = Tables<"cashup_expenses">
export type CashupPurchase = Tables<"cashup_purchases">
export type AuraImport = Tables<"aura_imports">
export type AuraFieldMapping = Tables<"aura_field_mappings">
export type BranchPaymentChannel = Tables<"branch_payment_channels">

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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      admin_email_allowlist: {
        Row: {
          company_id: string | null
          created_at: string
          email: string
          note: string | null
          organization_id: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email: string
          note?: string | null
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string
          note?: string | null
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "admin_email_allowlist_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_email_allowlist_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          id: boolean
          qr_base_url: string | null
          qr_last_check_at: string | null
          qr_legacy_domains: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          qr_base_url?: string | null
          qr_last_check_at?: string | null
          qr_legacy_domains?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          qr_base_url?: string | null
          qr_last_check_at?: string | null
          qr_legacy_domains?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      business_rules: {
        Row: {
          closed_weekdays: number[]
          id: boolean
          lead_time_days: number
          max_horizon_days: number
          min_rental_days: number
          pickup_location: string
          terms: string | null
          updated_at: string
          vat_percent: number
        }
        Insert: {
          closed_weekdays?: number[]
          id?: boolean
          lead_time_days?: number
          max_horizon_days?: number
          min_rental_days?: number
          pickup_location?: string
          terms?: string | null
          updated_at?: string
          vat_percent?: number
        }
        Update: {
          closed_weekdays?: number[]
          id?: boolean
          lead_time_days?: number
          max_horizon_days?: number
          min_rental_days?: number
          pickup_location?: string
          terms?: string | null
          updated_at?: string
          vat_percent?: number
        }
        Relationships: []
      }
      calculation_lines: {
        Row: {
          base_amount: number | null
          calculation_id: string
          commission_amount: number | null
          commission_type: string | null
          commission_value: number | null
          created_at: string
          days: number
          equipment_id: string | null
          id: string
          name: string
          organization_id: string | null
          quantity: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          base_amount?: number | null
          calculation_id: string
          commission_amount?: number | null
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          days?: number
          equipment_id?: string | null
          id?: string
          name: string
          organization_id?: string | null
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Update: {
          base_amount?: number | null
          calculation_id?: string
          commission_amount?: number | null
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          days?: number
          equipment_id?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "calculation_lines_calculation_id_fkey"
            columns: ["calculation_id"]
            isOneToOne: false
            referencedRelation: "calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculation_lines_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculation_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calculations: {
        Row: {
          calculation_number: string
          company_id: string
          converted_order_id: string | null
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          delivery_address: string | null
          discount_percent: number
          ends_on: string
          id: string
          notes: string | null
          responsible_staff_id: string
          shipping_method: string
          starts_on: string
          status: string
          title: string | null
          transport_amount: number | null
          transport_breakdown: Json | null
          transport_distance_m: number | null
          transport_duration_s: number | null
          transport_status: string
          updated_at: string
          vat_percent: number
          warehouse_id: string | null
        }
        Insert: {
          calculation_number?: string
          company_id?: string
          converted_order_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          delivery_address?: string | null
          discount_percent?: number
          ends_on?: string
          id?: string
          notes?: string | null
          responsible_staff_id?: string
          shipping_method?: string
          starts_on?: string
          status?: string
          title?: string | null
          transport_amount?: number | null
          transport_breakdown?: Json | null
          transport_distance_m?: number | null
          transport_duration_s?: number | null
          transport_status?: string
          updated_at?: string
          vat_percent?: number
          warehouse_id?: string | null
        }
        Update: {
          calculation_number?: string
          company_id?: string
          converted_order_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          delivery_address?: string | null
          discount_percent?: number
          ends_on?: string
          id?: string
          notes?: string | null
          responsible_staff_id?: string
          shipping_method?: string
          starts_on?: string
          status?: string
          title?: string | null
          transport_amount?: number | null
          transport_breakdown?: Json | null
          transport_distance_m?: number | null
          transport_duration_s?: number | null
          transport_status?: string
          updated_at?: string
          vat_percent?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calculations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculations_converted_order_id_fkey"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculations_responsible_staff_id_fkey"
            columns: ["responsible_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          company: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          postal_code: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      equipment: {
        Row: {
          barcode: string | null
          barcode_type: string
          category: string
          comment: string | null
          commission_type: string | null
          commission_value: number | null
          created_at: string
          created_by: string | null
          daily_price: number
          deposit_type: string
          deposit_value: number
          description: string | null
          external_report_email: string | null
          fixed_price: number
          forward_reports_to_external: boolean
          id: string
          image_url: string | null
          is_active: boolean
          item_code: string | null
          item_kind: string
          item_root_org_id: string | null
          item_seq: number | null
          label_last_printed_at: string | null
          label_print_count: number
          legacy_barcode: string | null
          name: string
          next_unit_number: number
          organization_id: string | null
          page_slug: string | null
          page_type: string | null
          parent_id: string | null
          quantity: number
          rate_unit: string
          serial_code: string
          sku: string | null
          sn_category_code: string | null
          sn_org_no: number | null
          sn_prefix: string | null
          sort_order: number
          tag: string | null
          tax_rate_id: string | null
          tracking: string
          updated_at: string
          variant_label: string | null
          warehouse_id: string
        }
        Insert: {
          barcode?: string | null
          barcode_type?: string
          category?: string
          comment?: string | null
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          created_by?: string | null
          daily_price?: number
          deposit_type?: string
          deposit_value?: number
          description?: string | null
          external_report_email?: string | null
          fixed_price?: number
          forward_reports_to_external?: boolean
          id?: string
          image_url?: string | null
          is_active?: boolean
          item_code?: string | null
          item_kind?: string
          item_root_org_id?: string | null
          item_seq?: number | null
          label_last_printed_at?: string | null
          label_print_count?: number
          legacy_barcode?: string | null
          name: string
          next_unit_number?: number
          organization_id?: string | null
          page_slug?: string | null
          page_type?: string | null
          parent_id?: string | null
          quantity?: number
          rate_unit?: string
          serial_code?: string
          sku?: string | null
          sn_category_code?: string | null
          sn_org_no?: number | null
          sn_prefix?: string | null
          sort_order?: number
          tag?: string | null
          tax_rate_id?: string | null
          tracking?: string
          updated_at?: string
          variant_label?: string | null
          warehouse_id?: string
        }
        Update: {
          barcode?: string | null
          barcode_type?: string
          category?: string
          comment?: string | null
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          created_by?: string | null
          daily_price?: number
          deposit_type?: string
          deposit_value?: number
          description?: string | null
          external_report_email?: string | null
          fixed_price?: number
          forward_reports_to_external?: boolean
          id?: string
          image_url?: string | null
          is_active?: boolean
          item_code?: string | null
          item_kind?: string
          item_root_org_id?: string | null
          item_seq?: number | null
          label_last_printed_at?: string | null
          label_print_count?: number
          legacy_barcode?: string | null
          name?: string
          next_unit_number?: number
          organization_id?: string | null
          page_slug?: string | null
          page_type?: string | null
          parent_id?: string | null
          quantity?: number
          rate_unit?: string
          serial_code?: string
          sku?: string | null
          sn_category_code?: string | null
          sn_org_no?: number | null
          sn_prefix?: string | null
          sort_order?: number
          tag?: string | null
          tax_rate_id?: string | null
          tracking?: string
          updated_at?: string
          variant_label?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_item_root_org_id_fkey"
            columns: ["item_root_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_ownership: {
        Row: {
          created_at: string
          equipment_id: string
          organization_id: string
          share_bps: number
        }
        Insert: {
          created_at?: string
          equipment_id: string
          organization_id: string
          share_bps: number
        }
        Update: {
          created_at?: string
          equipment_id?: string
          organization_id?: string
          share_bps?: number
        }
        Relationships: [
          {
            foreignKeyName: "equipment_ownership_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_ownership_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          client_fingerprint: string | null
          company: string | null
          created_at: string
          created_by: string | null
          email: string | null
          followup_date: string | null
          id: string
          message: string | null
          name: string
          notes: string | null
          phone: string | null
          rental_end: string | null
          rental_start: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          client_fingerprint?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          followup_date?: string | null
          id?: string
          message?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          rental_end?: string | null
          rental_start?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_fingerprint?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          followup_date?: string | null
          id?: string
          message?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          rental_end?: string | null
          rental_start?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      offer_items: {
        Row: {
          created_at: string
          created_by: string | null
          days: number
          description: string
          equipment_id: string | null
          id: string
          offer_id: string
          quantity: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          days?: number
          description: string
          equipment_id?: string | null
          id?: string
          offer_id: string
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          days?: number
          description?: string
          equipment_id?: string | null
          id?: string
          offer_id?: string
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "offer_items_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_items_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_name: string | null
          discount_percent: number
          id: string
          internal_notes: string | null
          intro: string | null
          lead_id: string | null
          offer_number: string
          rental_end: string | null
          rental_start: string | null
          sent_at: string | null
          share_token: string
          status: string
          terms: string | null
          title: string
          updated_at: string
          valid_until: string | null
          vat_percent: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string | null
          discount_percent?: number
          id?: string
          internal_notes?: string | null
          intro?: string | null
          lead_id?: string | null
          offer_number?: string
          rental_end?: string | null
          rental_start?: string | null
          sent_at?: string | null
          share_token?: string
          status?: string
          terms?: string | null
          title?: string
          updated_at?: string
          valid_until?: string | null
          vat_percent?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string | null
          discount_percent?: number
          id?: string
          internal_notes?: string | null
          intro?: string | null
          lead_id?: string | null
          offer_number?: string
          rental_end?: string | null
          rental_start?: string | null
          sent_at?: string | null
          share_token?: string
          status?: string
          terms?: string | null
          title?: string
          updated_at?: string
          valid_until?: string | null
          vat_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "offers_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          created_at: string
          created_by: string | null
          from_status: string | null
          id: string
          note: string | null
          order_id: string
          to_status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          order_id: string
          to_status: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          order_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_lines: {
        Row: {
          base_amount: number
          commission_amount: number
          commission_type: string | null
          commission_value: number | null
          created_at: string
          created_by: string | null
          days: number
          deposit_amount: number
          description: string
          ends_at: string | null
          ends_on: string | null
          equipment_id: string | null
          id: string
          order_id: string
          organization_id: string | null
          quantity: number
          sort_order: number
          starts_at: string | null
          starts_on: string | null
          tax_percent: number
          unit_price: number
        }
        Insert: {
          base_amount?: number
          commission_amount?: number
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          created_by?: string | null
          days?: number
          deposit_amount?: number
          description: string
          ends_at?: string | null
          ends_on?: string | null
          equipment_id?: string | null
          id?: string
          order_id: string
          organization_id?: string | null
          quantity?: number
          sort_order?: number
          starts_at?: string | null
          starts_on?: string | null
          tax_percent?: number
          unit_price?: number
        }
        Update: {
          base_amount?: number
          commission_amount?: number
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          created_by?: string | null
          days?: number
          deposit_amount?: number
          description?: string
          ends_at?: string | null
          ends_on?: string | null
          equipment_id?: string | null
          id?: string
          order_id?: string
          organization_id?: string | null
          quantity?: number
          sort_order?: number
          starts_at?: string | null
          starts_on?: string | null
          tax_percent?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          client_fingerprint: string | null
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_note: string | null
          delivery_address: string | null
          delivery_city: string | null
          delivery_postal_code: string | null
          deposit_amount: number
          discount_percent: number
          ends_on: string
          id: string
          internal_notes: string | null
          lead_id: string | null
          offer_id: string | null
          order_number: string
          paid_at: string | null
          payment_status: string
          picked_up_at: string | null
          responsible_staff_id: string | null
          returned_at: string | null
          share_token: string
          shipping_cost: number
          shipping_method: string
          shipping_zone_id: string | null
          source: string
          starts_on: string
          status: string
          transport_amount: number | null
          transport_breakdown: Json | null
          transport_distance_m: number | null
          transport_duration_s: number | null
          transport_status: string
          updated_at: string
          vat_percent: number
        }
        Insert: {
          client_fingerprint?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_note?: string | null
          delivery_address?: string | null
          delivery_city?: string | null
          delivery_postal_code?: string | null
          deposit_amount?: number
          discount_percent?: number
          ends_on?: string
          id?: string
          internal_notes?: string | null
          lead_id?: string | null
          offer_id?: string | null
          order_number?: string
          paid_at?: string | null
          payment_status?: string
          picked_up_at?: string | null
          responsible_staff_id?: string | null
          returned_at?: string | null
          share_token?: string
          shipping_cost?: number
          shipping_method?: string
          shipping_zone_id?: string | null
          source?: string
          starts_on?: string
          status?: string
          transport_amount?: number | null
          transport_breakdown?: Json | null
          transport_distance_m?: number | null
          transport_duration_s?: number | null
          transport_status?: string
          updated_at?: string
          vat_percent?: number
        }
        Update: {
          client_fingerprint?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_note?: string | null
          delivery_address?: string | null
          delivery_city?: string | null
          delivery_postal_code?: string | null
          deposit_amount?: number
          discount_percent?: number
          ends_on?: string
          id?: string
          internal_notes?: string | null
          lead_id?: string | null
          offer_id?: string | null
          order_number?: string
          paid_at?: string | null
          payment_status?: string
          picked_up_at?: string | null
          responsible_staff_id?: string | null
          returned_at?: string | null
          share_token?: string
          shipping_cost?: number
          shipping_method?: string
          shipping_zone_id?: string | null
          source?: string
          starts_on?: string
          status?: string
          transport_amount?: number | null
          transport_breakdown?: Json | null
          transport_distance_m?: number | null
          transport_duration_s?: number | null
          transport_status?: string
          updated_at?: string
          vat_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_responsible_staff_id_fkey"
            columns: ["responsible_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shipping_zone_id_fkey"
            columns: ["shipping_zone_id"]
            isOneToOne: false
            referencedRelation: "shipping_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invoice_rows: {
        Row: {
          amount: number
          base_amount: number
          commission_amount: number
          created_at: string
          customer_name: string | null
          ends_on: string | null
          equipment_id: string | null
          id: string
          invoiced_at: string | null
          item_title: string | null
          order_id: string
          order_line_id: string
          order_number: string | null
          organization_id: string | null
          row_type: string
          share_bps: number
          starts_on: string | null
        }
        Insert: {
          amount?: number
          base_amount?: number
          commission_amount?: number
          created_at?: string
          customer_name?: string | null
          ends_on?: string | null
          equipment_id?: string | null
          id?: string
          invoiced_at?: string | null
          item_title?: string | null
          order_id: string
          order_line_id: string
          order_number?: string | null
          organization_id?: string | null
          row_type: string
          share_bps?: number
          starts_on?: string | null
        }
        Update: {
          amount?: number
          base_amount?: number
          commission_amount?: number
          created_at?: string
          customer_name?: string | null
          ends_on?: string | null
          equipment_id?: string | null
          id?: string
          invoiced_at?: string | null
          item_title?: string | null
          order_id?: string
          order_line_id?: string
          order_number?: string | null
          organization_id?: string | null
          row_type?: string
          share_bps?: number
          starts_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_invoice_rows_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invoice_rows_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invoice_rows_order_line_id_fkey"
            columns: ["order_line_id"]
            isOneToOne: false
            referencedRelation: "order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invoice_rows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          commission_type: string | null
          commission_value: number | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          item_prefix: string | null
          item_prefix_locked: boolean
          label_brand_name: string | null
          label_email: string | null
          label_logo_url: string | null
          name: string
          next_item_number: number
          notes: string | null
          org_number: string | null
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          item_prefix?: string | null
          item_prefix_locked?: boolean
          label_brand_name?: string | null
          label_email?: string | null
          label_logo_url?: string | null
          name: string
          next_item_number?: number
          notes?: string | null
          org_number?: string | null
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          item_prefix?: string | null
          item_prefix_locked?: boolean
          label_brand_name?: string | null
          label_email?: string | null
          label_logo_url?: string | null
          name?: string
          next_item_number?: number
          notes?: string | null
          org_number?: string | null
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      price_rules: {
        Row: {
          adjust_type: string | null
          adjust_value: number
          created_at: string
          created_by: string | null
          day_price: number | null
          ends_on: string | null
          equipment_id: string | null
          from_day: number | null
          id: string
          is_active: boolean
          kind: string
          name: string
          priority: number
          starts_on: string | null
          to_day: number | null
          updated_at: string
          weekdays: number[]
        }
        Insert: {
          adjust_type?: string | null
          adjust_value?: number
          created_at?: string
          created_by?: string | null
          day_price?: number | null
          ends_on?: string | null
          equipment_id?: string | null
          from_day?: number | null
          id?: string
          is_active?: boolean
          kind: string
          name?: string
          priority?: number
          starts_on?: string | null
          to_day?: number | null
          updated_at?: string
          weekdays?: number[]
        }
        Update: {
          adjust_type?: string | null
          adjust_value?: number
          created_at?: string
          created_by?: string | null
          day_price?: number | null
          ends_on?: string | null
          equipment_id?: string | null
          from_day?: number | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          priority?: number
          starts_on?: string | null
          to_day?: number | null
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "price_rules_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      product_components: {
        Row: {
          child_equipment_id: string
          created_at: string
          created_by: string | null
          id: string
          parent_equipment_id: string
          quantity: number
        }
        Insert: {
          child_equipment_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          parent_equipment_id: string
          quantity?: number
        }
        Update: {
          child_equipment_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          parent_equipment_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_components_child_equipment_id_fkey"
            columns: ["child_equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_components_parent_equipment_id_fkey"
            columns: ["parent_equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      serial_codes: {
        Row: {
          code: string
          created_at: string
          equipment_id: string | null
          kind: string
          replaced_at: string | null
          stock_item_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          equipment_id?: string | null
          kind?: string
          replaced_at?: string | null
          stock_item_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          equipment_id?: string | null
          kind?: string
          replaced_at?: string | null
          stock_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "serial_codes_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serial_codes_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      serial_counters: {
        Row: {
          last_value: number
          scope: string
          updated_at: string
        }
        Insert: {
          last_value: number
          scope: string
          updated_at?: string
        }
        Update: {
          last_value?: number
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      shipping_zones: {
        Row: {
          base_fee: number
          cities: string[]
          created_at: string
          created_by: string | null
          distance_km: number
          id: string
          is_active: boolean
          name: string
          per_km: number
          postal_prefixes: string[]
          sort_order: number
          updated_at: string
        }
        Insert: {
          base_fee?: number
          cities?: string[]
          created_at?: string
          created_by?: string | null
          distance_km?: number
          id?: string
          is_active?: boolean
          name: string
          per_km?: number
          postal_prefixes?: string[]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          base_fee?: number
          cities?: string[]
          created_at?: string
          created_by?: string | null
          distance_km?: number
          id?: string
          is_active?: boolean
          name?: string
          per_km?: number
          postal_prefixes?: string[]
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      site_page_overrides: {
        Row: {
          en: Json
          image: string | null
          is_active: boolean
          page_key: string
          page_type: string
          price_from: number | null
          slug: string
          sv: Json
          updated_at: string
        }
        Insert: {
          en?: Json
          image?: string | null
          is_active?: boolean
          page_key: string
          page_type: string
          price_from?: number | null
          slug: string
          sv?: Json
          updated_at?: string
        }
        Update: {
          en?: Json
          image?: string | null
          is_active?: boolean
          page_key?: string
          page_type?: string
          price_from?: number | null
          slug?: string
          sv?: Json
          updated_at?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          company_id: string
          created_at: string
          email: string
          hourly_rate_sek: number
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string
          email: string
          hourly_rate_sek?: number
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string
          hourly_rate_sek?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_item_assignments: {
        Row: {
          checked_out_at: string | null
          created_at: string
          created_by: string | null
          damaged: boolean
          id: string
          notes: string | null
          order_line_id: string
          returned_at: string | null
          stock_item_id: string
        }
        Insert: {
          checked_out_at?: string | null
          created_at?: string
          created_by?: string | null
          damaged?: boolean
          id?: string
          notes?: string | null
          order_line_id: string
          returned_at?: string | null
          stock_item_id: string
        }
        Update: {
          checked_out_at?: string | null
          created_at?: string
          created_by?: string | null
          damaged?: boolean
          id?: string
          notes?: string | null
          order_line_id?: string
          returned_at?: string | null
          stock_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_item_assignments_order_line_id_fkey"
            columns: ["order_line_id"]
            isOneToOne: false
            referencedRelation: "order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_item_assignments_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_items: {
        Row: {
          barcode: string | null
          barcode_type: string
          created_at: string
          created_by: string | null
          equipment_id: string
          id: string
          identifier: string
          import_batch: string | null
          is_test: boolean
          label_last_printed_at: string | null
          label_print_count: number
          location: string | null
          notes: string | null
          qr_token: string
          serial_code: string
          serial_number: string | null
          sn_item_no: number | null
          sn_org_no: number | null
          sn_series_id: string | null
          status: string
          unit_number: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          barcode_type?: string
          created_at?: string
          created_by?: string | null
          equipment_id: string
          id?: string
          identifier: string
          import_batch?: string | null
          is_test?: boolean
          label_last_printed_at?: string | null
          label_print_count?: number
          location?: string | null
          notes?: string | null
          qr_token?: string
          serial_code?: string
          serial_number?: string | null
          sn_item_no?: number | null
          sn_org_no?: number | null
          sn_series_id?: string | null
          status?: string
          unit_number?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          barcode_type?: string
          created_at?: string
          created_by?: string | null
          equipment_id?: string
          id?: string
          identifier?: string
          import_batch?: string | null
          is_test?: boolean
          label_last_printed_at?: string | null
          label_print_count?: number
          location?: string | null
          notes?: string | null
          qr_token?: string
          serial_code?: string
          serial_number?: string | null
          sn_item_no?: number | null
          sn_org_no?: number | null
          sn_series_id?: string | null
          status?: string
          unit_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_sn_series_id_fkey"
            columns: ["sn_series_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          name: string
          percent: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name: string
          percent?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name?: string
          percent?: number
        }
        Relationships: []
      }
      transport_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          response: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at: string
          response: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          response?: Json
        }
        Relationships: []
      }
      transport_quote_log: {
        Row: {
          client_fingerprint: string
          created_at: string
          id: number
        }
        Insert: {
          client_fingerprint: string
          created_at?: string
          id?: number
        }
        Update: {
          client_fingerprint?: string
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      unit_movements: {
        Row: {
          action: string
          forced: boolean
          from_status: string | null
          id: string
          note: string | null
          order_id: string | null
          performed_at: string
          performed_by: string | null
          reference: string | null
          stock_item_id: string
          to_status: string | null
        }
        Insert: {
          action: string
          forced?: boolean
          from_status?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          performed_at?: string
          performed_by?: string | null
          reference?: string | null
          stock_item_id: string
          to_status?: string | null
        }
        Update: {
          action?: string
          forced?: boolean
          from_status?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          performed_at?: string
          performed_by?: string | null
          reference?: string | null
          stock_item_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unit_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_movements_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_reports: {
        Row: {
          admin_note: string | null
          created_at: string
          external_notified_at: string | null
          external_notify_status: string | null
          handled_at: string | null
          handled_by: string | null
          id: string
          message: string
          report_type: string
          reporter_email: string | null
          reporter_name: string | null
          reporter_phone: string | null
          reporter_role: string
          status: string
          stock_item_id: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          external_notified_at?: string | null
          external_notify_status?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          message: string
          report_type: string
          reporter_email?: string | null
          reporter_name?: string | null
          reporter_phone?: string | null
          reporter_role: string
          status?: string
          stock_item_id: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          external_notified_at?: string | null
          external_notify_status?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          message?: string
          report_type?: string
          reporter_email?: string | null
          reporter_name?: string | null
          reporter_phone?: string | null
          reporter_role?: string
          status?: string
          stock_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_reports_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_companies: {
        Row: {
          company_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_organizations: {
        Row: {
          created_at: string
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          address: string
          created_at: string
          id: string
          is_active: boolean
          lat: number | null
          lng: number | null
          loading_time_hours: number
          name: string
          rig_up_time_hours: number
          staff_per_delivery: number
          truck_cost_per_10km_sek: number
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          loading_time_hours?: number
          name: string
          rig_up_time_hours?: number
          staff_per_delivery?: number
          truck_cost_per_10km_sek?: number
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          loading_time_hours?: number
          name?: string
          rig_up_time_hours?: number
          staff_per_delivery?: number
          truck_cost_per_10km_sek?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allocate_item_id: { Args: { _equipment_id: string }; Returns: string }
      allocate_unit_serial: {
        Args: { _equipment_id: string }
        Returns: Record<string, unknown>
      }
      available_quantity: {
        Args: {
          _end: string
          _equipment_id: string
          _exclude_order?: string
          _start: string
        }
        Returns: number
      }
      available_quantity_at: {
        Args: {
          _end: string
          _equipment_id: string
          _exclude_order?: string
          _start: string
        }
        Returns: number
      }
      build_invoice_rows: {
        Args: { _order_line_id: string }
        Returns: undefined
      }
      commission_for: {
        Args: { _base: number; _equipment_id: string; _qty: number }
        Returns: Json
      }
      confirm_order: { Args: { _order_id: string }; Returns: Json }
      convert_calculation_to_order: {
        Args: { _calculation_id: string }
        Returns: Json
      }
      convert_stock_to_units: {
        Args: { _equipment_ids: string[] }
        Returns: Json
      }
      create_booking: { Args: { _payload: Json }; Returns: Json }
      create_units: {
        Args: {
          _batch?: string
          _count: number
          _equipment_id: string
          _is_test?: boolean
          _location?: string
          _serials?: string[]
        }
        Returns: {
          id: string
          qr_token: string
          serial_code: string
          serial_number: string
          unit_number: string
        }[]
      }
      delete_item: { Args: { _equipment_id: string }; Returns: Json }
      delete_units: { Args: { _unit_ids: string[] }; Returns: number }
      derive_item_code: { Args: { _name: string }; Returns: string }
      derive_org_prefix: { Args: { _name: string }; Returns: string }
      equipment_reserved: {
        Args: {
          _end: string
          _equipment_id: string
          _exclude_order?: string
          _start: string
        }
        Returns: number
      }
      equipment_reserved_at: {
        Args: {
          _end: string
          _equipment_id: string
          _exclude_order?: string
          _start: string
        }
        Returns: number
      }
      equipment_total_units: {
        Args: { _equipment_id: string }
        Returns: number
      }
      format_unit_serial_code: {
        Args: {
          _category_code: string
          _n_org: number
          _n_unit: number
          _prefix: string
        }
        Returns: string
      }
      generate_barcode_value: { Args: never; Returns: string }
      get_public_offer: { Args: { _token: string }; Returns: Json }
      get_public_unit: { Args: { _token: string }; Returns: Json }
      grant_allowlisted_admin: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_member_of_organization: { Args: { _org_id: string }; Returns: boolean }
      is_partner_of: { Args: { _company_id: string }; Returns: boolean }
      letters_only: { Args: { _s: string }; Returns: string }
      list_org_invoice_rows: {
        Args: { _org_id?: string }
        Returns: {
          amount: number
          base_amount: number
          commission_amount: number
          customer_name: string
          ends_at: string
          ends_on: string
          id: string
          invoiced_at: string
          item_title: string
          order_id: string
          order_number: string
          order_status: string
          organization_id: string
          organization_name: string
          paid_at: string
          row_type: string
          share_bps: number
          starts_on: string
          status: string
        }[]
      }
      my_company_ids: { Args: never; Returns: string[] }
      my_jobs: { Args: { _all?: boolean }; Returns: Json }
      new_qr_token: { Args: never; Returns: string }
      next_org_serial_number: {
        Args: { _org_id: string }
        Returns: Record<string, unknown>
      }
      next_stock_unit_number: { Args: never; Returns: string }
      next_unit_serial_code: {
        Args: { _equipment_id: string }
        Returns: string
      }
      org_invoice_lines: {
        Args: { _from?: string; _org_id?: string; _to?: string }
        Returns: {
          base_amount: number
          commission_amount: number
          commission_type: string
          commission_value: number
          days: number
          ends_on: string
          item: string
          net_to_org: number
          order_id: string
          order_line_id: string
          order_number: string
          order_status: string
          organization_id: string
          organization_name: string
          quantity: number
          starts_on: string
        }[]
      }
      preview_serial_codes: {
        Args: { _equipment_ids: string[] }
        Returns: string[]
      }
      price_for: {
        Args: {
          _end: string
          _equipment_id: string
          _qty?: number
          _start: string
        }
        Returns: Json
      }
      price_for_base: {
        Args: {
          _end: string
          _equipment_id: string
          _qty?: number
          _start: string
        }
        Returns: Json
      }
      record_label_print: { Args: { _unit_ids: string[] }; Returns: number }
      resolve_shipping: {
        Args: {
          _city: string
          _method: string
          _postal: string
          _zone_id: string
        }
        Returns: {
          base_fee: number
          cities: string[]
          created_at: string
          created_by: string | null
          distance_km: number
          id: string
          is_active: boolean
          name: string
          per_km: number
          postal_prefixes: string[]
          sort_order: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "shipping_zones"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      scan_lookup: { Args: { _code: string }; Returns: Json }
      serial_category_code: { Args: { _category: string }; Returns: string }
      serial_series_prefix: { Args: { _root: string }; Returns: string }
      serial_series_root: { Args: { _org_id: string }; Returns: string }
      set_equipment_ownership: {
        Args: { _equipment_id: string; _shares: Json }
        Returns: number
      }
      set_invoice_rows_invoiced: {
        Args: { _ids: string[]; _invoiced?: boolean }
        Returns: number
      }
      shipping_cost_for: {
        Args: {
          _city?: string
          _method: string
          _postal?: string
          _zone_id?: string
        }
        Returns: Json
      }
      stock_conversion_plan: { Args: { _equipment_id: string }; Returns: Json }
      stock_conversion_preview: { Args: never; Returns: Json }
      submit_lead: {
        Args: {
          _client_fingerprint?: string
          _company?: string
          _email: string
          _form_started_at?: number
          _honeypot?: string
          _message?: string
          _name: string
          _phone?: string
          _rental_end?: string
          _rental_start?: string
          _source?: string
        }
        Returns: Json
      }
      submit_unit_report: {
        Args: {
          _email?: string
          _honeypot?: string
          _message: string
          _name?: string
          _phone?: string
          _role: string
          _token: string
          _type: string
        }
        Returns: Json
      }
      unit_has_rental_history: { Args: { _unit_id: string }; Returns: boolean }
      unit_move: {
        Args: {
          _action: string
          _force?: boolean
          _order_id?: string
          _reference?: string
          _unit_ids: string[]
        }
        Returns: Json
      }
      unit_serial_repair: { Args: { _apply?: boolean }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "user" | "tester" | "partner"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "tester", "partner"],
    },
  },
} as const

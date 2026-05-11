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
      daily_totals: {
        Row: {
          battery_charged_kwh: number
          battery_discharged_kwh: number
          day: string
          grid_exported_kwh: number
          grid_used_kwh: number
          id: string
          load_kwh: number
          pv_kwh: number
          site_id: string
        }
        Insert: {
          battery_charged_kwh?: number
          battery_discharged_kwh?: number
          day: string
          grid_exported_kwh?: number
          grid_used_kwh?: number
          id?: string
          load_kwh?: number
          pv_kwh?: number
          site_id: string
        }
        Update: {
          battery_charged_kwh?: number
          battery_discharged_kwh?: number
          day?: string
          grid_exported_kwh?: number
          grid_used_kwh?: number
          id?: string
          load_kwh?: number
          pv_kwh?: number
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_totals_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      license_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          duration_days: number
          id: string
          notes: string | null
          owner_id: string | null
          plan: string
          redeemed_at: string | null
          redeemed_by_site: string | null
          site_name: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          duration_days?: number
          id?: string
          notes?: string | null
          owner_id?: string | null
          plan?: string
          redeemed_at?: string | null
          redeemed_by_site?: string | null
          site_name?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          duration_days?: number
          id?: string
          notes?: string | null
          owner_id?: string | null
          plan?: string
          redeemed_at?: string | null
          redeemed_by_site?: string | null
          site_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "license_codes_redeemed_by_site_fkey"
            columns: ["redeemed_by_site"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sites: {
        Row: {
          created_at: string
          description: string | null
          device_token: string
          force_refresh_at: string | null
          hardware_id: string | null
          id: string
          inverter_model: string | null
          inverter_serial: string | null
          last_seen_at: string | null
          license_expires_at: string | null
          name: string
          owner_id: string
          plan: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          device_token?: string
          force_refresh_at?: string | null
          hardware_id?: string | null
          id?: string
          inverter_model?: string | null
          inverter_serial?: string | null
          last_seen_at?: string | null
          license_expires_at?: string | null
          name: string
          owner_id: string
          plan?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          device_token?: string
          force_refresh_at?: string | null
          hardware_id?: string | null
          id?: string
          inverter_model?: string | null
          inverter_serial?: string | null
          last_seen_at?: string | null
          license_expires_at?: string | null
          name?: string
          owner_id?: string
          plan?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      telemetry_samples: {
        Row: {
          ac_output_active_power: number | null
          ac_output_apparent_power: number | null
          ac_output_frequency: number | null
          ac_output_voltage: number | null
          battery_capacity: number | null
          battery_charging_current: number | null
          battery_discharge_current: number | null
          battery_voltage: number | null
          bus_voltage: number | null
          device_status: string | null
          grid_frequency: number | null
          grid_voltage: number | null
          id: number
          inverter_mode: string | null
          inverter_temperature: number | null
          load_percent: number | null
          pv_input_current: number | null
          pv_input_power: number | null
          pv_input_voltage: number | null
          raw: Json | null
          recorded_at: string
          site_id: string
        }
        Insert: {
          ac_output_active_power?: number | null
          ac_output_apparent_power?: number | null
          ac_output_frequency?: number | null
          ac_output_voltage?: number | null
          battery_capacity?: number | null
          battery_charging_current?: number | null
          battery_discharge_current?: number | null
          battery_voltage?: number | null
          bus_voltage?: number | null
          device_status?: string | null
          grid_frequency?: number | null
          grid_voltage?: number | null
          id?: number
          inverter_mode?: string | null
          inverter_temperature?: number | null
          load_percent?: number | null
          pv_input_current?: number | null
          pv_input_power?: number | null
          pv_input_voltage?: number | null
          raw?: Json | null
          recorded_at?: string
          site_id: string
        }
        Update: {
          ac_output_active_power?: number | null
          ac_output_apparent_power?: number | null
          ac_output_frequency?: number | null
          ac_output_voltage?: number | null
          battery_capacity?: number | null
          battery_charging_current?: number | null
          battery_discharge_current?: number | null
          battery_voltage?: number | null
          bus_voltage?: number | null
          device_status?: string | null
          grid_frequency?: number | null
          grid_voltage?: number | null
          id?: number
          inverter_mode?: string | null
          inverter_temperature?: number | null
          load_percent?: number | null
          pv_input_current?: number | null
          pv_input_power?: number | null
          pv_input_voltage?: number | null
          raw?: Json | null
          recorded_at?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_samples_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      compute_daily_totals: {
        Args: { _day: string; _site: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      refresh_all_today_totals: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "superadmin" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["superadmin", "user"],
    },
  },
} as const

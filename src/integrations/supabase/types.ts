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
      apk_config: {
        Row: {
          app_id: string
          app_name: string
          background_color: string
          cleartext: boolean
          enable_push: boolean
          github_repo_url: string | null
          icon_url: string | null
          id: number
          primary_color: string
          server_url: string
          splash_color: string
          splash_url: string | null
          start_path: string
          status_bar_style: string
          updated_at: string
          version_code: number
          version_name: string
        }
        Insert: {
          app_id?: string
          app_name?: string
          background_color?: string
          cleartext?: boolean
          enable_push?: boolean
          github_repo_url?: string | null
          icon_url?: string | null
          id?: number
          primary_color?: string
          server_url?: string
          splash_color?: string
          splash_url?: string | null
          start_path?: string
          status_bar_style?: string
          updated_at?: string
          version_code?: number
          version_name?: string
        }
        Update: {
          app_id?: string
          app_name?: string
          background_color?: string
          cleartext?: boolean
          enable_push?: boolean
          github_repo_url?: string | null
          icon_url?: string | null
          id?: number
          primary_color?: string
          server_url?: string
          splash_color?: string
          splash_url?: string | null
          start_path?: string
          status_bar_style?: string
          updated_at?: string
          version_code?: number
          version_name?: string
        }
        Relationships: []
      }
      branding_settings: {
        Row: {
          accent_color: string | null
          accent_color_dark: string | null
          background_color: string | null
          background_color_dark: string | null
          border_color: string | null
          border_color_dark: string | null
          card_color: string | null
          card_color_dark: string | null
          destructive_color: string | null
          destructive_color_dark: string | null
          favicon_url: string | null
          favicon_url_dark: string | null
          font_body: string | null
          font_display: string | null
          foreground_color: string | null
          foreground_color_dark: string | null
          key: string
          logo_url: string | null
          logo_url_dark: string | null
          muted_color: string | null
          muted_color_dark: string | null
          primary_color: string | null
          primary_color_dark: string | null
          primary_foreground: string | null
          primary_foreground_dark: string | null
          pwa_background_color: string | null
          pwa_background_color_dark: string | null
          pwa_description: string | null
          pwa_display: string | null
          pwa_icon_192: string | null
          pwa_icon_192_dark: string | null
          pwa_icon_512: string | null
          pwa_icon_512_dark: string | null
          pwa_name: string | null
          pwa_short_name: string | null
          pwa_theme_color: string | null
          pwa_theme_color_dark: string | null
          radius: string | null
          site_name: string
          success_color: string | null
          success_color_dark: string | null
          tagline: string | null
          updated_at: string
          warning_color: string | null
          warning_color_dark: string | null
        }
        Insert: {
          accent_color?: string | null
          accent_color_dark?: string | null
          background_color?: string | null
          background_color_dark?: string | null
          border_color?: string | null
          border_color_dark?: string | null
          card_color?: string | null
          card_color_dark?: string | null
          destructive_color?: string | null
          destructive_color_dark?: string | null
          favicon_url?: string | null
          favicon_url_dark?: string | null
          font_body?: string | null
          font_display?: string | null
          foreground_color?: string | null
          foreground_color_dark?: string | null
          key?: string
          logo_url?: string | null
          logo_url_dark?: string | null
          muted_color?: string | null
          muted_color_dark?: string | null
          primary_color?: string | null
          primary_color_dark?: string | null
          primary_foreground?: string | null
          primary_foreground_dark?: string | null
          pwa_background_color?: string | null
          pwa_background_color_dark?: string | null
          pwa_description?: string | null
          pwa_display?: string | null
          pwa_icon_192?: string | null
          pwa_icon_192_dark?: string | null
          pwa_icon_512?: string | null
          pwa_icon_512_dark?: string | null
          pwa_name?: string | null
          pwa_short_name?: string | null
          pwa_theme_color?: string | null
          pwa_theme_color_dark?: string | null
          radius?: string | null
          site_name?: string
          success_color?: string | null
          success_color_dark?: string | null
          tagline?: string | null
          updated_at?: string
          warning_color?: string | null
          warning_color_dark?: string | null
        }
        Update: {
          accent_color?: string | null
          accent_color_dark?: string | null
          background_color?: string | null
          background_color_dark?: string | null
          border_color?: string | null
          border_color_dark?: string | null
          card_color?: string | null
          card_color_dark?: string | null
          destructive_color?: string | null
          destructive_color_dark?: string | null
          favicon_url?: string | null
          favicon_url_dark?: string | null
          font_body?: string | null
          font_display?: string | null
          foreground_color?: string | null
          foreground_color_dark?: string | null
          key?: string
          logo_url?: string | null
          logo_url_dark?: string | null
          muted_color?: string | null
          muted_color_dark?: string | null
          primary_color?: string | null
          primary_color_dark?: string | null
          primary_foreground?: string | null
          primary_foreground_dark?: string | null
          pwa_background_color?: string | null
          pwa_background_color_dark?: string | null
          pwa_description?: string | null
          pwa_display?: string | null
          pwa_icon_192?: string | null
          pwa_icon_192_dark?: string | null
          pwa_icon_512?: string | null
          pwa_icon_512_dark?: string | null
          pwa_name?: string | null
          pwa_short_name?: string | null
          pwa_theme_color?: string | null
          pwa_theme_color_dark?: string | null
          radius?: string | null
          site_name?: string
          success_color?: string | null
          success_color_dark?: string | null
          tagline?: string | null
          updated_at?: string
          warning_color?: string | null
          warning_color_dark?: string | null
        }
        Relationships: []
      }
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
      dashboard_layouts: {
        Row: {
          device_id: string | null
          id: string
          site_id: string
          updated_at: string
          user_id: string
          widgets: Json
        }
        Insert: {
          device_id?: string | null
          id?: string
          site_id: string
          updated_at?: string
          user_id: string
          widgets?: Json
        }
        Update: {
          device_id?: string | null
          id?: string
          site_id?: string
          updated_at?: string
          user_id?: string
          widgets?: Json
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_layouts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_commands: {
        Row: {
          acked_at: string | null
          command: string
          created_at: string
          created_by: string | null
          device_id: string | null
          error: string | null
          id: string
          payload: Json
          result: Json | null
          sent_at: string | null
          site_id: string
          status: string
        }
        Insert: {
          acked_at?: string | null
          command: string
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          error?: string | null
          id?: string
          payload?: Json
          result?: Json | null
          sent_at?: string | null
          site_id: string
          status?: string
        }
        Update: {
          acked_at?: string | null
          command?: string
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          error?: string | null
          id?: string
          payload?: Json
          result?: Json | null
          sent_at?: string | null
          site_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_commands_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_snapshots: {
        Row: {
          agent_version: string | null
          board_model: string | null
          cpu_temp_c: number | null
          device_id: string | null
          internet_up: boolean | null
          ip_eth: string | null
          ip_public: string | null
          ip_wlan: string | null
          raw: Json | null
          site_id: string
          ssid: string | null
          storage_total_gb: number | null
          storage_used_pct: number | null
          updated_at: string
          usb_devices: number | null
          usb_devices_list: Json | null
          voltage_dips: number | null
        }
        Insert: {
          agent_version?: string | null
          board_model?: string | null
          cpu_temp_c?: number | null
          device_id?: string | null
          internet_up?: boolean | null
          ip_eth?: string | null
          ip_public?: string | null
          ip_wlan?: string | null
          raw?: Json | null
          site_id: string
          ssid?: string | null
          storage_total_gb?: number | null
          storage_used_pct?: number | null
          updated_at?: string
          usb_devices?: number | null
          usb_devices_list?: Json | null
          voltage_dips?: number | null
        }
        Update: {
          agent_version?: string | null
          board_model?: string | null
          cpu_temp_c?: number | null
          device_id?: string | null
          internet_up?: boolean | null
          ip_eth?: string | null
          ip_public?: string | null
          ip_wlan?: string | null
          raw?: Json | null
          site_id?: string
          ssid?: string | null
          storage_total_gb?: number | null
          storage_used_pct?: number | null
          updated_at?: string
          usb_devices?: number | null
          usb_devices_list?: Json | null
          voltage_dips?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "device_snapshots_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string
          driver: string | null
          id: string
          is_primary: boolean
          model: string | null
          name: string
          serial_number: string | null
          site_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver?: string | null
          id?: string
          is_primary?: boolean
          model?: string | null
          name: string
          serial_number?: string | null
          site_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver?: string | null
          id?: string
          is_primary?: boolean
          model?: string | null
          name?: string
          serial_number?: string | null
          site_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          enabled: boolean | null
          html_body: string
          id: string
          name: string
          subject: string
          text_body: string | null
          updated_at: string
        }
        Insert: {
          enabled?: boolean | null
          html_body: string
          id: string
          name: string
          subject: string
          text_body?: string | null
          updated_at?: string
        }
        Update: {
          enabled?: boolean | null
          html_body?: string
          id?: string
          name?: string
          subject?: string
          text_body?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      inverter_specs: {
        Row: {
          battery_type: string | null
          charger_source_priority: string | null
          device_id: string | null
          driver: string | null
          expected_ac_input_voltage: number | null
          firmware: string | null
          input_voltage_range: string | null
          machine_type: string | null
          max_ac_charge_current: number | null
          max_ac_input_current: number | null
          max_ac_output_apparent_power: number | null
          max_ac_output_current: number | null
          max_ac_output_power: number | null
          max_charge_current: number | null
          model_name: string | null
          nominal_battery_voltage: number | null
          output_source_priority: string | null
          raw: Json | null
          serial_number: string | null
          site_id: string
          topology: string | null
          updated_at: string
        }
        Insert: {
          battery_type?: string | null
          charger_source_priority?: string | null
          device_id?: string | null
          driver?: string | null
          expected_ac_input_voltage?: number | null
          firmware?: string | null
          input_voltage_range?: string | null
          machine_type?: string | null
          max_ac_charge_current?: number | null
          max_ac_input_current?: number | null
          max_ac_output_apparent_power?: number | null
          max_ac_output_current?: number | null
          max_ac_output_power?: number | null
          max_charge_current?: number | null
          model_name?: string | null
          nominal_battery_voltage?: number | null
          output_source_priority?: string | null
          raw?: Json | null
          serial_number?: string | null
          site_id: string
          topology?: string | null
          updated_at?: string
        }
        Update: {
          battery_type?: string | null
          charger_source_priority?: string | null
          device_id?: string | null
          driver?: string | null
          expected_ac_input_voltage?: number | null
          firmware?: string | null
          input_voltage_range?: string | null
          machine_type?: string | null
          max_ac_charge_current?: number | null
          max_ac_input_current?: number | null
          max_ac_output_apparent_power?: number | null
          max_ac_output_current?: number | null
          max_ac_output_power?: number | null
          max_charge_current?: number | null
          model_name?: string | null
          nominal_battery_voltage?: number | null
          output_source_priority?: string | null
          raw?: Json | null
          serial_number?: string | null
          site_id?: string
          topology?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inverter_specs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      license_audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json
          id: string
          license_code: string | null
          license_id: string | null
          performed_by: string | null
          performed_by_email: string | null
          plan: string | null
          reason: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          id?: string
          license_code?: string | null
          license_id?: string | null
          performed_by?: string | null
          performed_by_email?: string | null
          plan?: string | null
          reason?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          id?: string
          license_code?: string | null
          license_id?: string | null
          performed_by?: string | null
          performed_by_email?: string | null
          plan?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      license_codes: {
        Row: {
          assigned_email: string | null
          assigned_user_id: string | null
          code: string
          created_at: string
          created_by: string | null
          duration_days: number | null
          id: string
          is_lifetime: boolean
          notes: string | null
          owner_id: string | null
          plan: string
          redeemed_at: string | null
          redeemed_by_site: string | null
          revoked_at: string | null
          site_name: string | null
        }
        Insert: {
          assigned_email?: string | null
          assigned_user_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          duration_days?: number | null
          id?: string
          is_lifetime?: boolean
          notes?: string | null
          owner_id?: string | null
          plan?: string
          redeemed_at?: string | null
          redeemed_by_site?: string | null
          revoked_at?: string | null
          site_name?: string | null
        }
        Update: {
          assigned_email?: string | null
          assigned_user_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          duration_days?: number | null
          id?: string
          is_lifetime?: boolean
          notes?: string | null
          owner_id?: string | null
          plan?: string
          redeemed_at?: string | null
          redeemed_by_site?: string | null
          revoked_at?: string | null
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
      notification_events: {
        Row: {
          body: string | null
          created_at: string
          id: string
          metric: string | null
          read_at: string | null
          rule_id: string | null
          severity: string
          site_id: string
          title: string
          user_id: string
          value: number | null
          value_text: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          metric?: string | null
          read_at?: string | null
          rule_id?: string | null
          severity?: string
          site_id: string
          title: string
          user_id: string
          value?: number | null
          value_text?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          metric?: string | null
          read_at?: string | null
          rule_id?: string | null
          severity?: string
          site_id?: string
          title?: string
          user_id?: string
          value?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "notification_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_rules: {
        Row: {
          channels: Json
          cooldown_minutes: number
          created_at: string
          device_id: string | null
          enabled: boolean
          id: string
          last_triggered_at: string | null
          metric: string
          name: string
          operator: string
          severity: string
          site_id: string
          threshold: number | null
          threshold_text: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channels?: Json
          cooldown_minutes?: number
          created_at?: string
          device_id?: string | null
          enabled?: boolean
          id?: string
          last_triggered_at?: string | null
          metric: string
          name: string
          operator: string
          severity?: string
          site_id: string
          threshold?: number | null
          threshold_text?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channels?: Json
          cooldown_minutes?: number
          created_at?: string
          device_id?: string | null
          enabled?: boolean
          id?: string
          last_triggered_at?: string | null
          metric?: string
          name?: string
          operator?: string
          severity?: string
          site_id?: string
          threshold?: number | null
          threshold_text?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_rules_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      pairing_codes: {
        Row: {
          agent_version: string | null
          board_model: string | null
          claimed_at: string | null
          claimed_by_site: string | null
          claimed_by_user: string | null
          code: string
          created_at: string
          expires_at: string
          hardware_id: string
          id: string
          inverter_model: string | null
          inverter_serial: string | null
        }
        Insert: {
          agent_version?: string | null
          board_model?: string | null
          claimed_at?: string | null
          claimed_by_site?: string | null
          claimed_by_user?: string | null
          code: string
          created_at?: string
          expires_at?: string
          hardware_id: string
          id?: string
          inverter_model?: string | null
          inverter_serial?: string | null
        }
        Update: {
          agent_version?: string | null
          board_model?: string | null
          claimed_at?: string | null
          claimed_by_site?: string | null
          claimed_by_user?: string | null
          code?: string
          created_at?: string
          expires_at?: string
          hardware_id?: string
          id?: string
          inverter_model?: string | null
          inverter_serial?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pairing_codes_claimed_by_site_fkey"
            columns: ["claimed_by_site"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          description: string | null
          duration_days: number | null
          features: Json
          id: string
          is_lifetime: boolean
          name: string
          price_cents: number
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          duration_days?: number | null
          features?: Json
          id?: string
          is_lifetime?: boolean
          name: string
          price_cents?: number
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          duration_days?: number | null
          features?: Json
          id?: string
          is_lifetime?: boolean
          name?: string
          price_cents?: number
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
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
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pv_system_config: {
        Row: {
          array_kwp: number | null
          azimuth: number | null
          battery_ah_each: number | null
          battery_count: number | null
          battery_kwh: number | null
          battery_type: string | null
          battery_usable_dod_pct: number | null
          battery_voltage_each: number | null
          device_id: string | null
          latitude: number | null
          location_label: string | null
          longitude: number | null
          panel_count: number | null
          panel_watts: number | null
          site_id: string
          system_losses_pct: number | null
          tilt: number | null
          updated_at: string
        }
        Insert: {
          array_kwp?: number | null
          azimuth?: number | null
          battery_ah_each?: number | null
          battery_count?: number | null
          battery_kwh?: number | null
          battery_type?: string | null
          battery_usable_dod_pct?: number | null
          battery_voltage_each?: number | null
          device_id?: string | null
          latitude?: number | null
          location_label?: string | null
          longitude?: number | null
          panel_count?: number | null
          panel_watts?: number | null
          site_id: string
          system_losses_pct?: number | null
          tilt?: number | null
          updated_at?: string
        }
        Update: {
          array_kwp?: number | null
          azimuth?: number | null
          battery_ah_each?: number | null
          battery_count?: number | null
          battery_kwh?: number | null
          battery_type?: string | null
          battery_usable_dod_pct?: number | null
          battery_voltage_each?: number | null
          device_id?: string | null
          latitude?: number | null
          location_label?: string | null
          longitude?: number | null
          panel_count?: number | null
          panel_watts?: number | null
          site_id?: string
          system_losses_pct?: number | null
          tilt?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pv_system_config_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      site_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["site_member_role"]
          site_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["site_member_role"]
          site_id: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["site_member_role"]
          site_id?: string
          token?: string
        }
        Relationships: []
      }
      site_members: {
        Row: {
          created_at: string
          id: string
          invited_email: string | null
          role: Database["public"]["Enums"]["site_member_role"]
          site_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_email?: string | null
          role?: Database["public"]["Enums"]["site_member_role"]
          site_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_email?: string | null
          role?: Database["public"]["Enums"]["site_member_role"]
          site_id?: string
          user_id?: string
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
      smtp_settings: {
        Row: {
          enabled: boolean | null
          from_email: string | null
          from_name: string | null
          host: string | null
          key: string
          password: string | null
          port: number | null
          secure: boolean | null
          updated_at: string
          username: string | null
        }
        Insert: {
          enabled?: boolean | null
          from_email?: string | null
          from_name?: string | null
          host?: string | null
          key?: string
          password?: string | null
          port?: number | null
          secure?: boolean | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          enabled?: boolean | null
          from_email?: string | null
          from_name?: string | null
          host?: string | null
          key?: string
          password?: string | null
          port?: number | null
          secure?: boolean | null
          updated_at?: string
          username?: string | null
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
          device_id: string | null
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
          device_id?: string | null
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
          device_id?: string | null
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
            foreignKeyName: "telemetry_samples_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
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
      widget_configs: {
        Row: {
          created_at: string
          id: string
          label: string
          metrics: Json
          refresh_minutes: number
          site_id: string
          theme: string
          token_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          metrics?: Json
          refresh_minutes?: number
          site_id: string
          theme?: string
          token_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          metrics?: Json
          refresh_minutes?: number
          site_id?: string
          theme?: string
          token_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "widget_configs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "widget_configs_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "widget_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      widget_tokens: {
        Row: {
          created_at: string
          id: string
          label: string | null
          last_used_at: string | null
          revoked_at: string | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          token?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          token?: string
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
      has_site_access: {
        Args: {
          _min_role?: Database["public"]["Enums"]["site_member_role"]
          _site: string
          _user: string
        }
        Returns: boolean
      }
      is_site_member: {
        Args: {
          _min_role?: Database["public"]["Enums"]["site_member_role"]
          _site: string
          _user: string
        }
        Returns: boolean
      }
      refresh_all_today_totals: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "superadmin" | "user"
      site_member_role: "viewer" | "operator" | "admin"
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
      site_member_role: ["viewer", "operator", "admin"],
    },
  },
} as const

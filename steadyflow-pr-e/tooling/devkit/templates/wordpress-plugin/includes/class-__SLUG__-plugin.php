<?php
/**
 * Core plugin bootstrap.
 *
 * @package Steadyflow
 */

namespace Steadyflow\{{CLASS}};

if (!defined('ABSPATH')) {
  exit;
}

final class Plugin {
  private static ?Plugin $instance = null;

  public static function instance(): Plugin {
    if (self::$instance === null) {
      self::$instance = new self();
    }
    return self::$instance;
  }

  public function boot(): void {
    add_action('rest_api_init', [$this, 'register_routes']);
    add_action('admin_menu', [$this, 'admin_menu']);
  }

  public function register_routes(): void {
    register_rest_route('steadyflow/v1', '/health', [
      'methods' => 'GET',
      'permission_callback' => '__return_true',
      'callback' => static function () {
        return [
          'ok' => true,
          'plugin' => '{{SLUG}}',
          'woocommerce' => class_exists('WooCommerce'),
        ];
      },
    ]);
  }

  public function admin_menu(): void {
    add_options_page(
      '{{NAME}}',
      '{{NAME}}',
      'manage_options',
      '{{SLUG}}',
      [$this, 'render_settings']
    );
  }

  public function render_settings(): void {
    if (!current_user_can('manage_options')) {
      return;
    }
    echo '<div class="wrap"><h1>{{NAME}}</h1>';
    echo '<p>Connect Steadyflow commerce webhooks / REST sync here.</p>';
    echo '<p>Health: <code>/wp-json/steadyflow/v1/health</code></p></div>';
  }
}

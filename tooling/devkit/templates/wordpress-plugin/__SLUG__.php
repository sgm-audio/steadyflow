<?php
/**
 * Plugin Name: {{NAME}}
 * Description: Steadyflow commerce bridge for WordPress / WooCommerce.
 * Version: 0.1.0
 * Author: Steadyflow
 * Requires at least: 6.4
 * Requires PHP: 8.1
 * Text Domain: {{SLUG}}
 */

if (!defined('ABSPATH')) {
  exit;
}

define('{{CLASS}}_VERSION', '0.1.0');
define('{{CLASS}}_FILE', __FILE__);

require_once __DIR__ . '/includes/class-{{SLUG}}-plugin.php';

add_action('plugins_loaded', static function (): void {
  \Steadyflow\{{CLASS}}\Plugin::instance()->boot();
});

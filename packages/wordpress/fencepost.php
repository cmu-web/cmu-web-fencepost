<?php
/**
 * Plugin Name:       FencePost Link Previews
 * Plugin URI:        https://fencepost.andrew.cmu.edu/reference.html#wordpress
 * Description:       Makes each page's link preview image with FencePost when it's published or updated.
 * Version:           0.2.1
 * Requires at least: 6.6
 * Requires PHP:      8.1
 * Author:            Carnegie Mellon University
 * License:           BSD-3-Clause
 * License URI:       https://opensource.org/license/bsd-3-clause
 * Text Domain:       fencepost
 *
 * @package FencePost
 */

defined( 'ABSPATH' ) || exit;

const FENCEPOST_DEFAULT_ADDRESS = 'https://fencepost.andrew.cmu.edu';
const FENCEPOST_EVENT           = 'fencepost_make_preview';
const FENCEPOST_META_IMAGE      = '_fencepost_image';
const FENCEPOST_META_STATUS     = '_fencepost_status';
const FENCEPOST_META_MESSAGE    = '_fencepost_message';
const FENCEPOST_META_TIME       = '_fencepost_time';
const FENCEPOST_META_TRIES      = '_fencepost_tries';

// Settings: on or off, and where FencePost is, so a developer can point at a
// local copy
function fencepost_settings() {
	$saved = get_option( 'fencepost', array() );
	return array(
		'enabled' => ! isset( $saved['enabled'] ) || (bool) $saved['enabled'],
		'address' => untrailingslashit( ! empty( $saved['address'] ) ? $saved['address'] : FENCEPOST_DEFAULT_ADDRESS ),
	);
}

// The post types that get previews; a site can add its own
function fencepost_post_types() {
	return (array) apply_filters( 'fencepost_post_types', array( 'post', 'page' ) );
}

function fencepost_wants( $post ) {
	$post = get_post( $post );
	return $post
		&& fencepost_settings()['enabled']
		&& 'publish' === $post->post_status
		&& '' === (string) $post->post_password
		&& in_array( $post->post_type, fencepost_post_types(), true );
}

// One event per post: a second save before it runs changes nothing
function fencepost_queue( $post_id, $delay = MINUTE_IN_SECONDS ) {
	$args = array( (int) $post_id );
	if ( wp_next_scheduled( FENCEPOST_EVENT, $args ) ) {
		return;
	}
	wp_schedule_single_event( time() + $delay, FENCEPOST_EVENT, $args );
	update_post_meta( $post_id, FENCEPOST_META_STATUS, 'waiting' );
	update_post_meta( $post_id, FENCEPOST_META_MESSAGE, '' );
	update_post_meta( $post_id, FENCEPOST_META_TIME, time() );
}

// Published, or a published page updated: a minute later, so the page is live
// and saving isn't slowed
add_action(
	'wp_after_insert_post',
	function ( $post_id, $post ) {
		if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) || ! fencepost_wants( $post ) ) {
			return;
		}
		delete_post_meta( $post_id, FENCEPOST_META_TRIES );
		fencepost_queue( $post_id );
	},
	10,
	2
);
add_action( FENCEPOST_EVENT, 'fencepost_make_preview' );

function fencepost_record( $post_id, $status, $message = '' ) {
	update_post_meta( $post_id, FENCEPOST_META_STATUS, $status );
	update_post_meta( $post_id, FENCEPOST_META_MESSAGE, $message );
	update_post_meta( $post_id, FENCEPOST_META_TIME, time() );
}

// Asks FencePost for the page's preview and keeps the image. Only the page's
// public address and the site's name are sent; FencePost stores nothing.
function fencepost_make_preview( $post_id ) {
	$post_id = (int) $post_id;
	if ( ! fencepost_wants( $post_id ) ) {
		return;
	}
	$response = wp_remote_post(
		fencepost_settings()['address'] . '/api/preview',
		array(
			'timeout' => 60,
			'headers' => array( 'Content-Type' => 'application/json' ),
			'body'    => wp_json_encode(
				array(
					'url'  => get_permalink( $post_id ),
					'site' => wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ),
				)
			),
		)
	);
	$code = is_wp_error( $response ) ? 0 : (int) wp_remote_retrieve_response_code( $response );
	$body = is_wp_error( $response ) ? array() : json_decode( wp_remote_retrieve_body( $response ), true );
	$body = is_array( $body ) ? $body : array();

	if ( 200 === $code ) {
		$jpeg = base64_decode( (string) ( $body['image'] ?? '' ), true );
		if ( ! $jpeg || "\xFF\xD8\xFF" !== substr( $jpeg, 0, 3 ) ) {
			fencepost_record( $post_id, 'failed', __( 'FencePost sent something that isn’t a JPEG.', 'fencepost' ) );
			return;
		}
		$id = fencepost_save_image( $post_id, $jpeg );
		if ( is_wp_error( $id ) ) {
			fencepost_record( $post_id, 'failed', $id->get_error_message() );
			return;
		}
		delete_post_meta( $post_id, FENCEPOST_META_TRIES );
		fencepost_record( $post_id, 'ok' );
		return;
	}

	$message = (string) ( $body['error'] ?? '' );
	// Busy, slow or out of reach: once more in five minutes
	if ( 0 === $code || 429 === $code || 504 === $code ) {
		if ( ! get_post_meta( $post_id, FENCEPOST_META_TRIES, true ) ) {
			update_post_meta( $post_id, FENCEPOST_META_TRIES, 1 );
			wp_schedule_single_event( time() + 5 * MINUTE_IN_SECONDS, FENCEPOST_EVENT, array( $post_id ) );
			fencepost_record( $post_id, 'retrying', __( 'FencePost was busy, so it will try once more in five minutes.', 'fencepost' ) );
			return;
		}
		delete_post_meta( $post_id, FENCEPOST_META_TRIES );
		if ( is_wp_error( $response ) ) {
			/* translators: %s: the error */
			$message = sprintf( __( 'FencePost couldn’t be reached: %s', 'fencepost' ), $response->get_error_message() );
		}
	}
	// A site FencePost doesn't capture, a bot check, a sign-in: say why and stop
	fencepost_record( $post_id, 'failed', '' !== $message ? $message : __( 'FencePost couldn’t make a preview.', 'fencepost' ) );
}

// The JPEG in the media library, in place of the post's previous one
function fencepost_save_image( $post_id, $jpeg ) {
	$post   = get_post( $post_id );
	$name   = 'link-preview-' . ( $post->post_name ? $post->post_name : $post_id ) . '.jpg';
	$upload = wp_upload_bits( $name, null, $jpeg );
	if ( ! empty( $upload['error'] ) ) {
		return new WP_Error( 'fencepost_upload', $upload['error'] );
	}
	$title = wp_strip_all_tags( get_the_title( $post ) );
	$id    = wp_insert_attachment(
		array(
			'post_mime_type' => 'image/jpeg',
			/* translators: %s: the page's title */
			'post_title'     => sprintf( __( 'Link preview for %s', 'fencepost' ), $title ),
			'post_status'    => 'inherit',
		),
		$upload['file'],
		$post_id,
		true
	);
	if ( is_wp_error( $id ) ) {
		return $id;
	}
	require_once ABSPATH . 'wp-admin/includes/image.php';
	wp_update_attachment_metadata( $id, wp_generate_attachment_metadata( $id, $upload['file'] ) );
	/* translators: %s: the page's title */
	update_post_meta( $id, '_wp_attachment_image_alt', sprintf( __( 'Link preview for %s.', 'fencepost' ), $title ) );
	$old = (int) get_post_meta( $post_id, FENCEPOST_META_IMAGE, true );
	update_post_meta( $post_id, FENCEPOST_META_IMAGE, $id );
	if ( $old && $old !== $id ) {
		wp_delete_attachment( $old, true );
	}
	return $id;
}

// The image a page's preview should use from this plugin: none when it has a
// featured image, which always wins
function fencepost_image_id( $post = null ) {
	$post = get_post( $post );
	if ( ! $post || has_post_thumbnail( $post ) || ! fencepost_settings()['enabled'] ) {
		return 0;
	}
	$id = (int) get_post_meta( $post->ID, FENCEPOST_META_IMAGE, true );
	return $id && wp_attachment_is_image( $id ) ? $id : 0;
}

function fencepost_image( $id ) {
	$src = $id ? wp_get_attachment_image_src( $id, 'full' ) : false;
	return $src
		? array(
			'url'    => $src[0],
			'width'  => (int) $src[1],
			'height' => (int) $src[2],
			'alt'    => (string) get_post_meta( $id, '_wp_attachment_image_alt', true ),
		)
		: null;
}

// The page being shown, when it's one of ours
function fencepost_current_post() {
	if ( is_singular() ) {
		return get_queried_object();
	}
	if ( is_home() && get_option( 'page_for_posts' ) ) {
		return get_post( (int) get_option( 'page_for_posts' ) );
	}
	return null;
}

// Forbes & Moreword: its link preview fields
add_filter(
	'fam_link_preview',
	function ( $fields ) {
		$post = fencepost_current_post();
		$id   = $post ? fencepost_image_id( $post ) : 0;
		if ( $id ) {
			$fields['image'] = fencepost_image( $id );
		}
		return $fields;
	}
);

// Yoast SEO: after its own choices (the post's social image, then its
// featured image), before its site-wide default
add_filter(
	'wpseo_add_opengraph_additional_images',
	function ( $images ) {
		$post = fencepost_current_post();
		$id   = $post ? fencepost_image_id( $post ) : 0;
		if ( $id && is_object( $images ) && method_exists( $images, 'has_images' ) && ! $images->has_images() ) {
			$images->add_image_by_id( $id );
		}
		return $images;
	}
);

// Rank Math: the same, for its Facebook and X images
foreach ( array( 'facebook', 'twitter' ) as $fencepost_network ) {
	add_action(
		"rank_math/opengraph/{$fencepost_network}/add_additional_images",
		function ( $images ) {
			$post = fencepost_current_post();
			$id   = $post ? fencepost_image_id( $post ) : 0;
			if ( $id && is_object( $images ) && method_exists( $images, 'has_images' ) && ! $images->has_images() ) {
				$images->add_image_by_id( $id );
			}
		}
	);
}
unset( $fencepost_network );

// All in One SEO: its default image, used when the page's own source has none
add_filter(
	'aioseo_opengraph_default_image',
	function ( $image ) {
		$post = fencepost_current_post();
		$id   = $post ? fencepost_image_id( $post ) : 0;
		$src  = $id ? fencepost_image( $id ) : null;
		return $src ? $src['url'] : $image;
	}
);

// SEOPress: its og:image tags, unless the page has its own social image or
// the site applies one image everywhere
add_filter(
	'seopress_social_og_thumb',
	function ( $tags ) {
		$post = fencepost_current_post();
		$id   = $post ? fencepost_image_id( $post ) : 0;
		if ( ! $id
			|| ( function_exists( 'seopress_social_fb_img_post_option' ) && '' !== (string) seopress_social_fb_img_post_option() )
			|| '1' === (string) ( get_option( 'seopress_social_option_name' )['seopress_social_facebook_img_default'] ?? '' ) ) {
			return $tags;
		}
		$src = fencepost_image( $id );
		return fencepost_image_tags( $src, false );
	}
);

function fencepost_seo_plugin_active() {
	return defined( 'WPSEO_VERSION' ) || defined( 'RANK_MATH_VERSION' ) || defined( 'AIOSEO_VERSION' )
		|| defined( 'SEOPRESS_VERSION' ) || defined( 'THE_SEO_FRAMEWORK_VERSION' )
		|| function_exists( 'fam_link_preview_fields' );
}

function fencepost_image_tags( $src, $twitter = true ) {
	$out = sprintf( "<meta property=\"og:image\" content=\"%s\" />\n", esc_url( $src['url'] ) )
		. sprintf( "<meta property=\"og:image:width\" content=\"%d\" />\n", $src['width'] )
		. sprintf( "<meta property=\"og:image:height\" content=\"%d\" />\n", $src['height'] );
	if ( '' !== $src['alt'] ) {
		$out .= sprintf( "<meta property=\"og:image:alt\" content=\"%s\" />\n", esc_attr( $src['alt'] ) );
	}
	if ( $twitter ) {
		$out .= sprintf( "<meta name=\"twitter:image\" content=\"%s\" />\n", esc_url( $src['url'] ) );
	}
	return $out;
}

// Everywhere else: its own image tags, but only when nothing else in the head
// already wrote an og:image, so a page never gets two
add_action(
	'wp_head',
	function () {
		if ( ! fencepost_seo_plugin_active() && fencepost_current_post() ) {
			ob_start();
		}
	},
	-1000
);
add_action(
	'wp_head',
	function () {
		if ( fencepost_seo_plugin_active() || ! fencepost_current_post() ) {
			return;
		}
		$head = (string) ob_get_clean();
		echo $head; // phpcs:ignore WordPress.Security.EscapeOutput -- the head as other code wrote it
		if ( preg_match( '/<meta\b[^>]*\bproperty=["\']og:image["\']/i', $head ) ) {
			return;
		}
		$post = fencepost_current_post();
		$id   = has_post_thumbnail( $post ) ? (int) get_post_thumbnail_id( $post ) : fencepost_image_id( $post );
		$src  = $id ? fencepost_image( $id ) : null;
		if ( $src ) {
			echo fencepost_image_tags( $src ); // phpcs:ignore WordPress.Security.EscapeOutput -- escaped as built
		}
	},
	1000
);

// Settings › FencePost
add_action(
	'admin_init',
	function () {
		register_setting(
			'fencepost',
			'fencepost',
			array(
				'type'              => 'array',
				'sanitize_callback' => function ( $value ) {
					$address = esc_url_raw( trim( (string) ( $value['address'] ?? '' ) ), array( 'https', 'http' ) );
					return array(
						'enabled' => ! empty( $value['enabled'] ),
						'address' => '' !== $address ? untrailingslashit( $address ) : FENCEPOST_DEFAULT_ADDRESS,
					);
				},
			)
		);
	}
);
add_action(
	'admin_menu',
	function () {
		add_options_page( __( 'FencePost', 'fencepost' ), __( 'FencePost', 'fencepost' ), 'manage_options', 'fencepost', 'fencepost_settings_page' );
	}
);
function fencepost_settings_page() {
	$s = fencepost_settings();
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'FencePost Link Previews', 'fencepost' ); ?></h1>
		<p><?php esc_html_e( 'When a page or post is published or updated, FencePost makes its link preview image: the picture Slack, Teams and social sites show when someone shares the link. A featured image always wins.', 'fencepost' ); ?></p>
		<p><?php esc_html_e( 'Pages must be public and on cmu.edu or an approved domain. Only the page’s public address and the site’s name are sent, and FencePost stores nothing.', 'fencepost' ); ?></p>
		<form method="post" action="options.php">
			<?php settings_fields( 'fencepost' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><?php esc_html_e( 'Link Previews', 'fencepost' ); ?></th>
					<td><label><input type="checkbox" name="fencepost[enabled]" value="1" <?php checked( $s['enabled'] ); ?> /> <?php esc_html_e( 'Make Link Previews With FencePost', 'fencepost' ); ?></label></td>
				</tr>
				<tr>
					<th scope="row"><label for="fencepost-address"><?php esc_html_e( 'FencePost Address', 'fencepost' ); ?></label></th>
					<td>
						<input type="url" class="regular-text" id="fencepost-address" name="fencepost[address]" value="<?php echo esc_attr( $s['address'] ); ?>" />
						<p class="description"><?php echo esc_html( sprintf( /* translators: %s: the default address */ __( 'Leave it as %s unless you run your own copy.', 'fencepost' ), FENCEPOST_DEFAULT_ADDRESS ) ); ?></p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}

// Make a New Preview, on each row of Pages and Posts
function fencepost_row_action( $actions, $post ) {
	if ( fencepost_wants( $post ) && current_user_can( 'edit_post', $post->ID ) ) {
		$url                    = wp_nonce_url( admin_url( 'admin-post.php?action=fencepost_make&post=' . $post->ID ), 'fencepost_make_' . $post->ID );
		$actions['fencepost'] = '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Make a New Preview', 'fencepost' ) . '</a>';
	}
	return $actions;
}
add_filter( 'post_row_actions', 'fencepost_row_action', 10, 2 );
add_filter( 'page_row_actions', 'fencepost_row_action', 10, 2 );
add_action(
	'admin_post_fencepost_make',
	function () {
		$post_id = absint( $_GET['post'] ?? 0 ); // phpcs:ignore WordPress.Security.NonceVerification -- checked next
		check_admin_referer( 'fencepost_make_' . $post_id );
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			wp_die( esc_html__( 'You can’t edit that page.', 'fencepost' ) );
		}
		wp_clear_scheduled_hook( FENCEPOST_EVENT, array( $post_id ) );
		delete_post_meta( $post_id, FENCEPOST_META_TRIES );
		fencepost_queue( $post_id, 0 );
		wp_safe_redirect( add_query_arg( 'fencepost_queued', $post_id, wp_get_referer() ? wp_get_referer() : admin_url( 'edit.php' ) ) );
		exit;
	}
);
add_action(
	'admin_notices',
	function () {
		$post_id = absint( $_GET['fencepost_queued'] ?? 0 ); // phpcs:ignore WordPress.Security.NonceVerification -- a notice only
		if ( $post_id ) {
			printf(
				'<div class="notice notice-success is-dismissible"><p>%s</p></div>',
				/* translators: %s: the page's title */
				esc_html( sprintf( __( 'FencePost will make a new preview for “%s” in a moment.', 'fencepost' ), get_the_title( $post_id ) ) )
			);
		}
	}
);

// The last result, in a Link Preview column
function fencepost_ap_date( $time ) {
	$months = array( 1 => 'Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.' );
	$local  = (int) $time + (int) ( get_option( 'gmt_offset' ) * HOUR_IN_SECONDS );
	return $months[ (int) gmdate( 'n', $local ) ] . ' ' . gmdate( 'j, Y', $local );
}
function fencepost_status_text( $post_id ) {
	$status = get_post_meta( $post_id, FENCEPOST_META_STATUS, true );
	$time   = (int) get_post_meta( $post_id, FENCEPOST_META_TIME, true );
	$msg    = (string) get_post_meta( $post_id, FENCEPOST_META_MESSAGE, true );
	switch ( $status ) {
		case 'ok':
			/* translators: %s: a date */
			return sprintf( __( 'Made %s', 'fencepost' ), fencepost_ap_date( $time ) );
		case 'waiting':
			return __( 'Waiting', 'fencepost' );
		case 'retrying':
			return __( 'Trying again soon', 'fencepost' );
		case 'failed':
			/* translators: %s: why */
			return sprintf( __( 'Not made: %s', 'fencepost' ), $msg );
	}
	return '';
}
foreach ( array( 'post', 'page' ) as $fencepost_type ) {
	add_filter(
		"manage_{$fencepost_type}_posts_columns",
		function ( $columns ) {
			if ( fencepost_settings()['enabled'] ) {
				$columns['fencepost'] = __( 'Link Preview', 'fencepost' );
			}
			return $columns;
		}
	);
	add_action(
		"manage_{$fencepost_type}_posts_custom_column",
		function ( $column, $post_id ) {
			if ( 'fencepost' === $column ) {
				echo esc_html( fencepost_status_text( $post_id ) );
			}
		},
		10,
		2
	);
}
unset( $fencepost_type );

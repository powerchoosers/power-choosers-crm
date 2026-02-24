is there a way to get more location labels on a single search to see all surrounding locations on a single search?
Yes. Mapbox search and geocoding products support returning multiple nearby locations in a single request, but how you do it depends on which API/SDK you’re using.

1. Geocoding API (HTTP, Android Java SDK)
You can:

Increase the limit parameter to return more features for a single query (for example, more POIs or addresses around a point). [How geocoding works]
Use batch geocoding to send many queries in one request (up to 50 in the Android Java SDK example, 1000 in Geocoding v6 HTTP), and then plot all returned features on the map. [Android batch geocoding; Geocoding v6 batch]
Example (Android Java, multiple addresses in one request):

MapboxV6BatchGeocoding mapboxGeocoding = MapboxV6BatchGeocoding
    .builder(
        MAPBOX_ACCESS_TOKEN,
        Arrays.asList(
            V6ForwardGeocodingRequestOptions.builder("1600 Pennsylvania Avenue NW, Washington, DC 20500, United States").limit(1).build(),
            V6ForwardGeocodingRequestOptions.builder("2 15th Street NW, Washington, DC 20004, United States").limit(1).build()
        )
    )
    .build();
2. Search Box / Search SDKs (categories & nearby results)
Search Box and the mobile Search SDKs are designed to return multiple nearby POIs for a category or free‑text query:

Search Box can return category results like “coffee shops nearby” and list many POIs around the user. [Search Box overview]
On Android, the Discover API example shows searching for a category (e.g., coffee shops) around the user’s location or within the current map bounds, then displaying all results as markers. [Discover + Search UI example]
Example (Android Discover API, “coffee shop” around user):

val response = discover.search(
    query = DiscoverQuery.Category.COFFEE_SHOP_CAFE,
    proximity = location.toPoint(),
    options = DiscoverOptions(limit = 20)
)
3. iOS Search SDK
On iOS, SearchOptions lets you:

Set limit to control how many results you get.
Use proximity or boundingBox to focus results around a point or within a region, then show all returned results on the map. [SearchOptions params]
So yes: by using category/POI search with a higher limit, or batch geocoding, and then plotting all returned features as markers, you can show many surrounding locations from a single search.

Discover + Search UI + Maps SDK
Note
This example is a part of the Search SDK for Android sample app. You can find the values for all referenced resources in the res directory. For example, see res/values/strings.xml for R.string.* references used in this example. The dependencies can be found here. The examples use View binding. See setup documention if necessary.

activity_discover
github View on GitHub
<?xml version="1.0" encoding="utf-8"?>
<androidx.constraintlayout.widget.ConstraintLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    >

    <com.mapbox.maps.MapView
        android:id="@+id/map_view"
        android:layout_width="0dp"
        android:layout_height="0dp"
        app:layout_constraintBottom_toBottomOf="parent"
        app:layout_constraintEnd_toEndOf="parent"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintTop_toTopOf="parent"
        app:mapbox_logoGravity="bottom"
        />

    <Button
        android:id="@+id/search_nearby"
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_marginHorizontal="32dp"
        android:layout_marginBottom="16dp"
        android:background="@drawable/card_background"
        android:text="@string/discover_search_nearby"
        app:layout_constraintBottom_toTopOf="@+id/search_this_area"
        app:layout_constraintEnd_toEndOf="parent"
        app:layout_constraintStart_toStartOf="parent"
        />

    <Button
        android:id="@+id/search_this_area"
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_margin="32dp"
        android:background="@drawable/card_background"
        android:text="@string/discover_search_in_area"
        app:layout_constraintBottom_toBottomOf="parent"
        app:layout_constraintEnd_toEndOf="parent"
        app:layout_constraintStart_toStartOf="parent"
        />

    <androidx.coordinatorlayout.widget.CoordinatorLayout
        android:id="@+id/search_container_view"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:elevation="@dimen/search_card_elevation"
        >

        <com.mapbox.search.ui.view.place.SearchPlaceBottomSheetView
            android:id="@+id/search_place_view"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_gravity="center_horizontal"
            android:elevation="@dimen/search_card_elevation"
            />
    </androidx.coordinatorlayout.widget.CoordinatorLayout>
</androidx.constraintlayout.widget.ConstraintLayout>
DiscoverActivity.kt
github View on GitHub
package com.mapbox.search.sample

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Toast
import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.mapbox.android.gestures.Utils.dpToPx
import com.mapbox.common.location.LocationProvider
import com.mapbox.common.location.LocationServiceFactory
import com.mapbox.geojson.Point
import com.mapbox.maps.CameraOptions
import com.mapbox.maps.EdgeInsets
import com.mapbox.maps.MapView
import com.mapbox.maps.MapboxMap
import com.mapbox.maps.Style
import com.mapbox.maps.extension.style.layers.properties.generated.IconAnchor
import com.mapbox.maps.plugin.annotation.annotations
import com.mapbox.maps.plugin.annotation.generated.PointAnnotationOptions
import com.mapbox.maps.plugin.annotation.generated.createPointAnnotationManager
import com.mapbox.maps.plugin.locationcomponent.OnIndicatorPositionChangedListener
import com.mapbox.maps.plugin.locationcomponent.location
import com.mapbox.search.base.utils.extension.toPoint
import com.mapbox.search.common.DistanceCalculator
import com.mapbox.search.discover.Discover
import com.mapbox.search.discover.DiscoverAddress
import com.mapbox.search.discover.DiscoverOptions
import com.mapbox.search.discover.DiscoverQuery
import com.mapbox.search.discover.DiscoverResult
import com.mapbox.search.result.SearchAddress
import com.mapbox.search.result.SearchResultType
import com.mapbox.search.ui.view.CommonSearchViewConfiguration
import com.mapbox.search.ui.view.DistanceUnitType
import com.mapbox.search.ui.view.place.SearchPlace
import com.mapbox.search.ui.view.place.SearchPlaceBottomSheetView
import java.util.UUID

class DiscoverActivity : AppCompatActivity() {

    private lateinit var discover: Discover
    private lateinit var locationProvider: LocationProvider

    private lateinit var mapView: MapView
    private lateinit var mapboxMap: MapboxMap
    private lateinit var mapMarkersManager: MapMarkersManager

    private lateinit var searchNearby: View
    private lateinit var searchThisArea: View

    private lateinit var searchPlaceView: SearchPlaceBottomSheetView

    private fun defaultDeviceLocationProvider(): LocationProvider =
        LocationServiceFactory.getOrCreate()
            .getDeviceLocationProvider(null)
            .value
            ?: throw Exception("Failed to get device location provider")

    private fun Context.showToast(@StringRes resId: Int): Unit = Toast.makeText(this, resId, Toast.LENGTH_LONG).show()

    private fun Context.isPermissionGranted(permission: String): Boolean =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_discover)

        // Set your Access Token here if it's not already set in some other way
        // MapboxOptions.accessToken = "<my-access-token>"
        discover = Discover.create()
        locationProvider = defaultDeviceLocationProvider()

        mapView = findViewById(R.id.map_view)
        mapMarkersManager = MapMarkersManager(mapView)
        mapView.mapboxMap.also { mapboxMap ->
            this.mapboxMap = mapboxMap

            mapboxMap.loadStyle(Style.MAPBOX_STREETS) {
                mapView.location.updateSettings {
                    enabled = true
                }

                mapView.location.addOnIndicatorPositionChangedListener(object : OnIndicatorPositionChangedListener {
                    override fun onIndicatorPositionChanged(point: Point) {
                        mapView.mapboxMap.setCamera(
                            CameraOptions.Builder()
                                .center(point)
                                .zoom(14.0)
                                .build()
                        )

                        mapView.location.removeOnIndicatorPositionChangedListener(this)
                    }
                })
            }
        }

        searchNearby = findViewById(R.id.search_nearby)
        searchNearby.setOnClickListener {
            locationProvider.getLastLocation { location ->
                if (location == null) {
                    return@getLastLocation
                }

                lifecycleScope.launchWhenStarted {
                    val response = discover.search(
                        query = DiscoverQuery.Category.COFFEE_SHOP_CAFE,
                        proximity = location.toPoint(),
                        options = DiscoverOptions(limit = 20)
                    )

                    response.onValue { results ->
                        mapMarkersManager.showResults(results)
                    }.onError { e ->
                        Log.d("DiscoverApiExample", "Error happened during search request", e)
                        showToast(R.string.discover_search_error)
                    }
                }
            }
        }

        searchThisArea = findViewById(R.id.search_this_area)
        searchThisArea.setOnClickListener {
            lifecycleScope.launchWhenStarted {
                val response = discover.search(
                    query = DiscoverQuery.Category.COFFEE_SHOP_CAFE,
                    region = mapboxMap.getBounds().bounds.toBoundingBox(),
                    options = DiscoverOptions(limit = 20)
                )

                response.onValue { results ->
                    mapMarkersManager.showResults(results)
                }.onError { e ->
                    Log.d("DiscoverApiExample", "Error happened during search request", e)
                    showToast(R.string.discover_search_error)
                }
            }
        }

        searchPlaceView = findViewById<SearchPlaceBottomSheetView>(R.id.search_place_view).apply {
            initialize(CommonSearchViewConfiguration(DistanceUnitType.IMPERIAL))
            isFavoriteButtonVisible = false
            addOnCloseClickListener {
                mapMarkersManager.adjustMarkersForClosedCard()
                searchPlaceView.hide()
            }
        }

        mapMarkersManager.onResultClickListener = { result ->
            mapMarkersManager.adjustMarkersForOpenCard()
            searchPlaceView.open(result.toSearchPlace())
            locationProvider.userDistanceTo(result.coordinate) { distance ->
                distance?.let { searchPlaceView.updateDistance(distance) }
            }
        }

        if (!isPermissionGranted(Manifest.permission.ACCESS_FINE_LOCATION)) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                ),
                PERMISSIONS_REQUEST_LOCATION
            )
        }
    }

    private fun LocationProvider.userDistanceTo(destination: Point, callback: (Double?) -> Unit) {
        getLastLocation { location ->
            if (location == null) {
                callback(null)
            } else {
                val distance = DistanceCalculator.instance(latitude = location.latitude)
                    .distance(location.toPoint(), destination)
                callback(distance)
            }
        }
    }

    private class MapMarkersManager(mapView: MapView) {

        private val annotations = mutableMapOf<String, DiscoverResult>()
        private val mapboxMap: MapboxMap = mapView.mapboxMap
        private val pointAnnotationManager = mapView.annotations.createPointAnnotationManager(null)
        private val pinBitmap = mapView.context.bitmapFromDrawableRes(R.drawable.red_marker)

        var onResultClickListener: ((DiscoverResult) -> Unit)? = null

        init {
            pointAnnotationManager.addClickListener {
                annotations[it.id]?.let { result ->
                    onResultClickListener?.invoke(result)
                }
                true
            }
        }

        private fun Context.bitmapFromDrawableRes(@DrawableRes resId: Int): Bitmap = BitmapFactory.decodeResource(resources, resId)

        fun clearMarkers() {
            pointAnnotationManager.deleteAll()
            annotations.clear()
        }

        fun adjustMarkersForOpenCard() {
            val coordinates = annotations.values.map { it.coordinate }
            mapboxMap.cameraForCoordinates(
                coordinates, CameraOptions.Builder().build(), MARKERS_INSETS_OPEN_CARD, null, null
            ) {
                mapboxMap.setCamera(it)
            }
        }

        fun adjustMarkersForClosedCard() {
            val coordinates = annotations.values.map { it.coordinate }
            mapboxMap.cameraForCoordinates(
                coordinates, CameraOptions.Builder().build(), MARKERS_INSETS, null, null
            ) {
                mapboxMap.setCamera(it)
            }
        }

        fun showResults(results: List<DiscoverResult>) {
            clearMarkers()
            if (results.isEmpty()) {
                return
            }

            val coordinates = ArrayList<Point>(results.size)
            results.forEach { result ->
                val options = PointAnnotationOptions()
                    .withPoint(result.coordinate)
                    .withIconImage(pinBitmap)
                    .withIconAnchor(IconAnchor.BOTTOM)

                val annotation = pointAnnotationManager.create(options)
                annotations[annotation.id] = result
                coordinates.add(result.coordinate)
            }

            mapboxMap.cameraForCoordinates(
                coordinates, CameraOptions.Builder().build(), MARKERS_INSETS, null, null
            ) {
                mapboxMap.setCamera(it)
            }
        }
    }

    private companion object {

        const val PERMISSIONS_REQUEST_LOCATION = 0

        val MARKERS_BOTTOM_OFFSET = dpToPx(176f).toDouble()
        val MARKERS_EDGE_OFFSET = dpToPx(64f).toDouble()
        val PLACE_CARD_HEIGHT = dpToPx(300f).toDouble()

        val MARKERS_INSETS = EdgeInsets(
            MARKERS_EDGE_OFFSET, MARKERS_EDGE_OFFSET, MARKERS_BOTTOM_OFFSET, MARKERS_EDGE_OFFSET
        )

        val MARKERS_INSETS_OPEN_CARD = EdgeInsets(
            MARKERS_EDGE_OFFSET, MARKERS_EDGE_OFFSET, PLACE_CARD_HEIGHT, MARKERS_EDGE_OFFSET
        )

        fun DiscoverAddress.toSearchAddress(): SearchAddress {
            return SearchAddress(
                houseNumber = houseNumber,
                street = street,
                neighborhood = neighborhood,
                locality = locality,
                postcode = postcode,
                place = place,
                district = district,
                region = region,
                country = country
            )
        }

        fun DiscoverResult.toSearchPlace(): SearchPlace {
            return SearchPlace(
                id = name + UUID.randomUUID().toString(),
                name = name,
                descriptionText = null,
                address = address.toSearchAddress(),
                resultTypes = listOf(SearchResultType.POI),
                record = null,
                coordinate = coordinate,
                routablePoints = routablePoints,
                categories = categories,
                makiIcon = makiIcon,
                metadata = null,
                distanceMeters = null,
                feedback = null,
            )
        }
    }
}
Was this example help
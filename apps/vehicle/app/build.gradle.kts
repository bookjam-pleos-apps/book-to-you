import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

val appId = providers.gradleProperty("vehicle.applicationId").get()
val apkBaseName = providers.gradleProperty("vehicle.apkBaseName").get()
// 시연 서버 주소는 빌드할 때 -Pvehicle.releaseApiBaseUrl=https://... 로 넣는다.
val debugApiBaseUrl = providers.gradleProperty("vehicle.debugApiBaseUrl").orElse("http://10.0.2.2:3000").get()
// 벨트 시험 토글. 에뮬레이터는 벨트 값을 바꿀 수 없어 시연에 필요하다. release에서 끄려면 false.
val cabinDebugToggle = providers.gradleProperty("vehicle.cabinDebugToggle").orElse("true").get()
// 심사자용 데모 코드 입력칸. 시연 서버는 부모 로그인이 꺼져 있어 QR 연결로는 붙을 수 없으므로 기본으로 켠다.
val demoCodePairing = providers.gradleProperty("vehicle.demoCodePairing").orElse("true").get()
// 시연 빌드 전용: 연결이 없으면 데모 코드로 시연 계정에 자동으로 붙는다. 제품 빌드에서는 끈다(기본 false).
// 코드는 저장소에 넣지 않는다. 켤 때 -Pvehicle.demoAutoPairCode=... 또는 ~/.gradle/gradle.properties로 넣는다.
val demoAutoPair = providers.gradleProperty("vehicle.demoAutoPair").orElse("false").get().toBoolean()
val demoAutoPairCode = providers.gradleProperty("vehicle.demoAutoPairCode").orElse("").get().trim()
// 코드는 BuildConfig 문자열에 그대로 들어가므로 영문·숫자·하이픈만 받는다. 값은 메시지에 넣지 않는다.
if (demoAutoPair && !demoAutoPairCode.matches(Regex("[A-Za-z0-9-]+"))) {
    throw GradleException("vehicle.demoAutoPair=true에는 -Pvehicle.demoAutoPairCode=<시연 서버 데모 코드(영문·숫자·하이픈)> 가 필요하다")
}
// 기본값이 없다. 빠뜨리면 아무 서버에도 못 붙는 APK가 조용히 나오므로 release를 만들 때 실패시킨다(아래 requireReleaseApiBaseUrl).
val releaseApiBaseUrl: String? = providers.gradleProperty("vehicle.releaseApiBaseUrl").orNull
// 서명 키와 비밀번호는 저장소 밖 파일에 둔다. 그 경로만 ~/.gradle/gradle.properties에 적는다(README "release 서명").
class ReleaseSigning(source: File) {
    private val props = Properties().apply { source.inputStream().use(::load) }
    private fun value(key: String): String? = props.getProperty(key)?.takeIf { it.isNotBlank() }

    // 상대 경로는 이 파일의 폴더 기준이다. 모듈 기준 file()로 풀면 저장소 안을 찾는다.
    val storeFile: File? = value("storeFile")?.let { source.absoluteFile.parentFile.resolve(it) }
    val storePassword: String? = value("storePassword")
    val keyAlias: String? = value("keyAlias")
    val keyPassword: String? = value("keyPassword")
    val missingKeys: List<String> = listOf(
        "storeFile" to storeFile, "storePassword" to storePassword, "keyAlias" to keyAlias, "keyPassword" to keyPassword,
    ).filter { it.second == null }.map { it.first }
}
val releaseSigningPath: String? = providers.gradleProperty("vehicle.releaseSigningProperties").orNull
val releaseSigning: ReleaseSigning? = releaseSigningPath?.let(::file)?.takeIf { it.isFile }?.let(::ReleaseSigning)

android {
    namespace = "com.voicestorybook.vehicle"
    compileSdk = 34
    useLibrary("android.car")

    defaultConfig {
        applicationId = appId
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
        base.archivesName.set(apkBaseName)
        buildConfigField("boolean", "DEMO_CODE_PAIRING", demoCodePairing)
        buildConfigField("boolean", "CABIN_DEBUG_TOGGLE", cabinDebugToggle)
        buildConfigField("boolean", "DEMO_AUTO_PAIR", demoAutoPair.toString())
        // 끄면 코드를 APK에 넣지 않는다.
        buildConfigField("String", "DEMO_AUTO_PAIR_CODE", "\"${if (demoAutoPair) demoAutoPairCode else ""}\"")
    }
    signingConfigs {
        releaseSigning?.let { signing ->
            create("release") {
                storeFile = signing.storeFile
                storePassword = signing.storePassword
                keyAlias = signing.keyAlias
                keyPassword = signing.keyPassword
            }
        }
    }
    buildTypes {
        debug {
            // 기본은 에뮬레이터에서 본 맥의 로컬 API. 픽스처 서버는 -Pvehicle.debugApiBaseUrl=http://10.0.2.2:3100
            // 평문 HTTP는 debug의 network_security_config만 허용한다.
            buildConfigField("String", "API_BASE_URL", "\"$debugApiBaseUrl\"")
        }
        release {
            buildConfigField("String", "API_BASE_URL", "\"${releaseApiBaseUrl.orEmpty()}\"")
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation(project(":core"))
    implementation("ai.pleos.playground:Vehicle:2.3.2")
    implementation("ai.pleos.playground:NaviHelper:3.0.5")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-session:1.4.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.zxing:core:3.5.3")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    testImplementation(kotlin("test"))
    testImplementation("org.robolectric:robolectric:4.13")
    testImplementation("androidx.test:core:1.6.1")
}

// release는 평문 HTTP를 허용하지 않아 https 주소만 받는다. debug 빌드는 검사하지 않는다.
val requireReleaseApiBaseUrl by tasks.registering {
    doLast {
        val url = releaseApiBaseUrl
        if (url.isNullOrBlank() || !url.startsWith("https://")) {
            throw GradleException("release 빌드에는 -Pvehicle.releaseApiBaseUrl=https://<시연 서버 출처> 가 필요하다 (지금: ${url ?: "없음"})")
        }
    }
}

// 서명 없이 만들면 설치할 수 없는 APK가 조용히 나온다. 값은 메시지에 넣지 않고 빠진 키 이름만 알린다.
val requireReleaseSigning by tasks.registering {
    doLast {
        val signing = releaseSigning
            ?: throw GradleException("release 빌드에는 vehicle.releaseSigningProperties=<서명 properties 경로> 가 필요하다 (지금: ${releaseSigningPath ?: "없음"}, 파일이 없거나 경로가 비었다)")
        if (signing.missingKeys.isNotEmpty()) throw GradleException("서명 properties에 빠진 키: ${signing.missingKeys.joinToString()}")
        if (signing.storeFile?.isFile != true) throw GradleException("서명 keystore 파일이 없다: ${signing.storeFile}")
    }
}
tasks.matching { it.name == "preReleaseBuild" }.configureEach { dependsOn(requireReleaseApiBaseUrl, requireReleaseSigning) }

// WindowSizeResourcesTest가 res xml을 직접 읽는다. 입력으로 잡아야 자원만 바뀌어도 테스트가 다시 돈다.
tasks.withType<Test>().configureEach {
    inputs.dir("src/main/res").withPathSensitivity(PathSensitivity.RELATIVE)
}

plugins {
    id("com.android.application")
}

val releaseKeystorePath = providers.environmentVariable("ROBYS_KEYSTORE_PATH")
val releaseStorePassword = providers.environmentVariable("ROBYS_STORE_PASSWORD")
val releaseKeyAlias = providers.environmentVariable("ROBYS_KEY_ALIAS")
val releaseKeyPassword = providers.environmentVariable("ROBYS_KEY_PASSWORD")

val releaseSigningReady =
    releaseKeystorePath.isPresent &&
    releaseStorePassword.isPresent &&
    releaseKeyAlias.isPresent &&
    releaseKeyPassword.isPresent

android {
    namespace = "com.robys.coffeehouse"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.robys.coffeehouse"
        minSdk = 23
        targetSdk = 36
        versionCode = 3
        versionName = "1.2"
    }

    if (releaseSigningReady) {
        signingConfigs {
            create("release") {
                storeFile = file(releaseKeystorePath.get())
                storePassword = releaseStorePassword.get()
                keyAlias = releaseKeyAlias.get()
                keyPassword = releaseKeyPassword.get()
            }
        }
    }

    buildTypes {
        getByName("debug") {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        getByName("release") {
            isMinifyEnabled = false
            isShrinkResources = false
            signingConfig = signingConfigs.findByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = true
        checkReleaseBuilds = true
    }
}

tasks.matching { it.name == "packageRelease" || it.name == "assembleRelease" }.configureEach {
    doFirst {
        check(releaseSigningReady) {
            "Release signing is not configured. Set ROBYS_KEYSTORE_PATH, ROBYS_STORE_PASSWORD, ROBYS_KEY_ALIAS and ROBYS_KEY_PASSWORD."
        }
    }
}

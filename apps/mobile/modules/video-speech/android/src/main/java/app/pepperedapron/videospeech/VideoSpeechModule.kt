package app.pepperedapron.videospeech

import android.Manifest
import android.content.Context
import android.content.Intent
import android.media.AudioFormat
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import java.util.concurrent.atomic.AtomicBoolean

/**
 * On-device transcription of a video's speech: the audio track is decoded to 16 kHz mono PCM
 * (SpeechAudio) and streamed to the on-device SpeechRecognizer (Android 13+). Nothing is sent
 * over the network.
 */
class VideoSpeechModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null

  override fun definition() = ModuleDefinition {
    Name("VideoSpeech")

    AsyncFunction("transcribe") { videoUri: String, language: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        promise.reject("ERR_UNSUPPORTED", "Android 13 or later is required.", null)
        return@AsyncFunction
      }
      if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
        promise.reject("ERR_UNSUPPORTED", "On-device speech recognition is not available.", null)
        return@AsyncFunction
      }
      val permissions = appContext.permissions
      if (permissions == null) {
        promise.reject("ERR_PERMISSION", "Permissions are unavailable.", null)
        return@AsyncFunction
      }
      // The system recognizer requires this permission even for a file; the microphone is not used.
      permissions.askForPermissions(
        PermissionsResponseListener { result ->
          if (result[Manifest.permission.RECORD_AUDIO]?.status != PermissionsStatus.GRANTED) {
            promise.reject("ERR_PERMISSION", "Speech recognition is not allowed.", null)
          } else {
            Thread { decodeThenRecognize(context, videoUri, language, promise) }.start()
          }
        },
        Manifest.permission.RECORD_AUDIO,
      )
    }

    OnDestroy {
      main.post {
        recognizer?.destroy()
        recognizer = null
      }
    }
  }

  private fun decodeThenRecognize(context: Context, videoUri: String, language: String, promise: Promise) {
    val pcm: ByteArray
    try {
      pcm = SpeechAudio.decodeToMono16k(context, Uri.parse(videoUri))
    } catch (e: SpeechAudio.NoAudioException) {
      promise.reject("ERR_NO_AUDIO", "This video has no sound.", e)
      return
    } catch (e: Exception) {
      promise.reject("ERR_TRANSCRIBE", "Cannot read this video's sound.", e)
      return
    }
    val pipe: Array<ParcelFileDescriptor>
    try {
      pipe = ParcelFileDescriptor.createPipe()
    } catch (e: IOException) {
      promise.reject("ERR_TRANSCRIBE", "Cannot stream the audio.", e)
      return
    }
    // The recognizer reads at its own pace: write from a background thread, then close.
    Thread {
      try {
        ParcelFileDescriptor.AutoCloseOutputStream(pipe[1]).use { it.write(pcm) }
      } catch (_: IOException) {
        // The recognizer stopped reading (error or cancellation): nothing more to write.
      }
    }.start()
    main.post { recognize(context, pipe[0], language, promise) }
  }

  private fun recognize(context: Context, audio: ParcelFileDescriptor, language: String, promise: Promise) {
    recognizer?.destroy()
    val rec = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
    recognizer = rec
    val lines = mutableListOf<String>()
    val settled = AtomicBoolean(false)
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
      putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, audio)
      putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1)
      putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
      putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, SpeechAudio.SAMPLE_RATE)
      // Long audio: results arrive phrase by phrase until the stream ends.
      putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_AUDIO_SOURCE)
      putExtra(RecognizerIntent.EXTRA_ENABLE_FORMATTING, RecognizerIntent.FORMATTING_OPTIMIZE_QUALITY)
    }

    fun finish(error: Pair<String, String>?) {
      if (!settled.compareAndSet(false, true)) return
      try {
        audio.close()
      } catch (_: IOException) {
      }
      main.post {
        rec.destroy()
        if (recognizer === rec) recognizer = null
      }
      if (error == null) promise.resolve(lines.toList()) else promise.reject(error.first, error.second, null)
    }

    fun collect(results: Bundle?) {
      results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
        ?.trim()?.takeIf { it.isNotEmpty() }?.let { lines.add(it) }
    }

    rec.setRecognitionListener(object : RecognitionListener {
      override fun onReadyForSpeech(params: Bundle?) {}
      override fun onBeginningOfSpeech() {}
      override fun onRmsChanged(rmsdB: Float) {}
      override fun onBufferReceived(buffer: ByteArray?) {}
      override fun onEndOfSpeech() {}
      override fun onPartialResults(partialResults: Bundle?) {}
      override fun onEvent(eventType: Int, params: Bundle?) {}

      override fun onSegmentResults(segmentResults: Bundle) = collect(segmentResults)

      override fun onEndOfSegmentedSession() = finish(null)

      override fun onResults(results: Bundle?) {
        collect(results)
        finish(null)
      }

      override fun onError(error: Int) {
        when (error) {
          // End of the audio without (more) speech: what was heard is the transcript.
          SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> finish(null)
          SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> {
            // Ask the system to download this language for next time.
            try {
              rec.triggerModelDownload(intent)
            } catch (_: Exception) {
            }
            finish("ERR_LANGUAGE" to language)
          }
          SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> finish("ERR_PERMISSION" to "Speech recognition is not allowed.")
          else -> if (lines.isNotEmpty()) finish(null) else finish("ERR_TRANSCRIBE" to "Recognition error $error")
        }
      }
    })
    rec.startListening(intent)
  }
}

package app.pepperedapron.videospeech

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import java.nio.ByteOrder

/** Audio track of a video → 16 kHz, mono, 16-bit little-endian PCM (what the recognizer expects). */
object SpeechAudio {
  const val SAMPLE_RATE = 16_000
  /** At most 10 minutes of speech (a recipe video is much shorter). */
  private const val MAX_SECONDS = 600

  class NoAudioException : Exception("No audio track")

  fun decodeToMono16k(context: Context, uri: Uri): ByteArray {
    val extractor = MediaExtractor()
    try {
      extractor.setDataSource(context, uri, null)
      val track = (0 until extractor.trackCount).firstOrNull {
        extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
      } ?: throw NoAudioException()
      extractor.selectTrack(track)
      val format = extractor.getTrackFormat(track)
      val decoded = decode(extractor, format)
      return toPcm16(Resampler.toMono16k(decoded.samples, decoded.sampleRate, decoded.channels))
    } finally {
      extractor.release()
    }
  }

  private class Decoded(val samples: FloatArray, val sampleRate: Int, val channels: Int)

  private fun decode(extractor: MediaExtractor, input: MediaFormat): Decoded {
    val mime = input.getString(MediaFormat.KEY_MIME)!!
    val codec = MediaCodec.createDecoderByType(mime)
    var sampleRate = input.getInteger(MediaFormat.KEY_SAMPLE_RATE)
    var channels = input.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
    var encoding = AudioFormat.ENCODING_PCM_16BIT
    val out = FloatBuilder()
    try {
      codec.configure(input, null, null, 0)
      codec.start()
      val info = MediaCodec.BufferInfo()
      var inputDone = false
      var outputDone = false
      while (!outputDone) {
        if (!inputDone) {
          val i = codec.dequeueInputBuffer(10_000)
          if (i >= 0) {
            val buffer = codec.getInputBuffer(i)!!
            val size = extractor.readSampleData(buffer, 0)
            if (size < 0) {
              codec.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              codec.queueInputBuffer(i, 0, size, extractor.sampleTime, 0)
              extractor.advance()
            }
          }
        }
        val o = codec.dequeueOutputBuffer(info, 10_000)
        when {
          o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            val f = codec.outputFormat
            sampleRate = f.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            channels = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            if (f.containsKey(MediaFormat.KEY_PCM_ENCODING)) encoding = f.getInteger(MediaFormat.KEY_PCM_ENCODING)
          }
          o >= 0 -> {
            val buffer = codec.getOutputBuffer(o)
            if (buffer != null && info.size > 0) {
              buffer.position(info.offset)
              buffer.limit(info.offset + info.size)
              val ordered = buffer.order(ByteOrder.nativeOrder())
              if (encoding == AudioFormat.ENCODING_PCM_FLOAT) {
                val floats = ordered.asFloatBuffer()
                while (floats.hasRemaining()) out.add(floats.get())
              } else {
                val shorts = ordered.asShortBuffer()
                while (shorts.hasRemaining()) out.add(shorts.get() / 32768f)
              }
            }
            codec.releaseOutputBuffer(o, false)
            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
            if (out.size >= sampleRate.toLong() * channels * MAX_SECONDS) outputDone = true
          }
        }
      }
    } finally {
      try {
        codec.stop()
      } catch (_: IllegalStateException) {
      }
      codec.release()
    }
    return Decoded(out.toArray(), sampleRate, channels)
  }

  private fun toPcm16(samples: FloatArray): ByteArray {
    val bytes = ByteArray(samples.size * 2)
    for (i in samples.indices) {
      val v = (samples[i].coerceIn(-1f, 1f) * 32767f).toInt()
      bytes[2 * i] = (v and 0xff).toByte()
      bytes[2 * i + 1] = ((v shr 8) and 0xff).toByte()
    }
    return bytes
  }

  private class FloatBuilder {
    private var data = FloatArray(1 shl 16)
    var size = 0
      private set

    fun add(v: Float) {
      if (size == data.size) data = data.copyOf(data.size * 2)
      data[size++] = v
    }

    fun toArray(): FloatArray = data.copyOf(size)
  }
}

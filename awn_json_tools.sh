#!/usr/bin/env bash
set -euo pipefail

# AWN JSON tools — sanity checks + slurp (append/merge)
# Vereist: jq (brew install jq)

# --- Defaults ---
AWN_DIR="."
CMD="check-all"
GLOB='messages.*.json'
ALLOW_SPECIAL='["valentine","newyear","easter",null]'

err(){ printf "❌ %s\n" "$*" >&2; }
ok(){  printf "✅ %s\n" "$*"; }
info(){ printf "ℹ️  %s\n" "$*"; }

usage(){
  cat <<'USAGE'
a warm note — JSON tools

Gebruik:
  awn_json_tools.sh [OPTIES] [PAD] COMMAND [ARGS...]

Commands:
  check-all                     Check alle JSON-bestanden (GLOB) in PAD
  stats-all                     Print statistieken voor alle bestanden
  check FILE.json               Check één bestand
  stats FILE.json               Statistieken voor één bestand
  append TARGET.json ADD.json   Voeg messages toe uit ADD (array of .messages[])
  merge  TARGET.json SRC.json   Merge sentiments (unie) en messages (de-dupe op id)
  fix-empty TARGET.json         Verwijder lege messages (lege text of lege sentiments)

Opties:
  -h, --help                    Toon deze help en stop
  -p, --path PATH               Zet basispad (default: .)
  -g, --glob PATTERN            Zet bestands-patroon (default: messages.*.json)
  --allow-special JSONARRAY     Toegestane special_day waarden (default: ["valentine","newyear","easter",null])

Voorbeelden:
  ./awn_json_tools.sh --help
  ./awn_json_tools.sh -p ./data check-all
  ./awn_json_tools.sh -p ./data stats-all
  ./awn_json_tools.sh -p ./data check messages.nl.json
  ./awn_json_tools.sh -p ./data append messages.nl.json add_nl_gratitude.json
  ./awn_json_tools.sh -p ./data merge messages.en.json messages.en.v002.json
  ./awn_json_tools.sh -p ./data --glob 'messages*.json' check-all
USAGE
}

parse_opts(){
  # eenvoudige, POSIX-vriendelijke parser
  while [ $# -gt 0 ]; do
    case "$1" in
      -h|--help)
        usage; exit 0 ;;
      -p|--path)
        AWN_DIR="${2:?--path vereist een waarde}"; shift 2 ;;
      -g|--glob)
        GLOB="${2:?--glob vereist een waarde}"; shift 2 ;;
      --allow-special)
        ALLOW_SPECIAL="${2:?--allow-special vereist een JSON array}"; shift 2 ;;
      --) shift; break ;;
      -*)
        err "Onbekende optie: $1"; usage; exit 1 ;;
      *)
        # Eerste niet-optie is [PAD] of COMMAND
        if [ "$AWN_DIR" = "." ] && [ -d "$1" ]; then
          AWN_DIR="$1"; shift
        else
          CMD="$1"; shift
          break
        fi
        ;;
    esac
  done

  # Rest (na COMMAND) doorgeven aan functies als $@
  # Niets te doen hier; main() leest "$@" verder uit.
}

need_jq(){
  if ! command -v jq >/dev/null 2>&1; then
    err "jq ontbreekt. Installeer met: brew install jq"
    exit 1
  fi
}

list_targets(){
  # Eén per regel
  find "$AWN_DIR" -maxdepth 1 -type f -name "$GLOB" | sort
}

check_file(){
  local f="$1"
  info "Check: $f"

  jq -e '
    (.lang|type=="string") and
    (.sentiments|type=="array") and
    (.messages|type=="array")
  ' "$f" >/dev/null || { err "$f: ontbrekende of onjuiste top-level keys (.lang/.sentiments/.messages)"; return 1; }

  jq -e '
    (.sentiments|all(type=="string")) and
    ((.sentiments|length) <= 10)
  ' "$f" >/dev/null || { err "$f: sentiments moeten strings zijn en ≤ 10 totaal"; return 1; }

  jq -e '
    .messages
    | all(
        (.id|type=="string" and length>0) and
        (.text|type=="string") and
        (.icon? | (type=="string") or .==null) and
        (.sentiments|type=="array") and
        (.weight? | (type=="number") or .==null) and
        (.special_day? | (type=="string") or .==null)
      )
  ' "$f" >/dev/null || { err "$f: één of meer messages hebben ongeldige velden"; return 1; }

  # Dubbele ids?
  local dup
  dup="$(jq -r '.messages[].id' "$f" | sort | uniq -d || true)"
  if [ -n "${dup:-}" ]; then
    err "$f: dubbele ids gevonden:"
    printf "%s\n" "$dup" >&2
    return 1
  fi

  # Lege text?
  local empty_texts
  empty_texts="$(jq -r '.messages[] | select((.text|length)==0) | .id' "$f" || true)"
  if [ -n "${empty_texts:-}" ]; then
    err "$f: lege text bij ids:"
    printf "%s\n" "$empty_texts" >&2
    return 1
  fi

  # Onbekende sentiments (niet in top-level)
  local unknown
  unknown="$(
    jq -r '
      . as $root
      | .messages[]
      | .id as $id
      | [.sentiments[] | select( . as $s | $root.sentiments | index($s) | not )]
      | select(length>0)
      | "\($id): " + (join(", "))
    ' "$f" || true
  )"
  if [ -n "${unknown:-}" ]; then
    err "$f: onbekende sentiments in messages (niet aanwezig in .sentiments):"
    printf "%s\n" "$unknown" >&2
    return 1
  fi

  # special_day validaties
  local badsd
  badsd="$(
    jq -r --argjson allow "$ALLOW_SPECIAL" '
      .messages[]
      | select(.special_day != null)
      | select( (.special_day|IN($allow[])) | not )
      | "\(.id): " + (.special_day|tostring)
    ' "$f" || true
  )"
  if [ -n "${badsd:-}" ]; then
    err "$f: ongeldige special_day (toegestaan: valentine, newyear, easter, of null):"
    printf "%s\n" "$badsd" >&2
    return 1
  fi

  ok "$f is OK"
}

check_all(){
  local rc=0
  local files
  files="$(list_targets)"
  if [ -z "$files" ]; then
    err "Geen bestanden gevonden in $AWN_DIR met patroon $GLOB"
    return 1
  fi
  # Itereren zonder mapfile
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if ! check_file "$f"; then rc=1; fi
  done <<< "$files"
  return "$rc"
}

stats_file(){
  local f="$1"
  info "Stats: $f"
  jq -r '
    def zeros: reduce .sentiments[] as $s ({}; .[$s]=0);
    def counts:
      reduce .messages[] as $m (zeros;
        reduce $m.sentiments[] as $s (.;
          .[$s] = ( (.[$s] // 0) + 1 )
        )
      );
    {
      lang: .lang,
      sentiments: .sentiments,
      per_sentiment: counts,
      total_messages: (.messages|length)
    }
  ' "$f"
}

stats_all(){
  local files
  files="$(list_targets)"
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    stats_file "$f"
  done <<< "$files"
}

slurp_append(){
  local target="$3" add="$4"
  info "Append naar $target vanuit $add (de-dupe op id)"
  jq '
    . as $t
    | ( input |
        if type=="array" then .
        elif has("messages") then .messages
        else error("ADD: verwacht array of object met .messages[]")
        end
      ) as $add
    | $t
    | .messages += (
        $add
        | unique_by(.id)
        | map(select(.id as $id | ($t.messages | any(.id == $id) | not)))
      )
  ' "$target" "$add" > "${target}.tmp"
  mv "${target}.tmp" "$target"
  ok "Append gereed voor $target"
}

slurp_merge(){
  local target="$3" src="$4"
  info "Merge $src → $target (sentiments unie, messages append de-dupe)"
  jq '
    . as $t
    | input as $s
    | {
        lang: $t.lang,
        sentiments: ( ($t.sentiments + $s.sentiments) | unique ),
        messages:
          ( $t.messages
            + ( $s.messages
                | unique_by(.id)
                | map(select(.id as $id | ($t.messages | any(.id == $id) | not)))
              )
          )
      }
  ' "$target" "$src" > "${target}.tmp"
  mv "${target}.tmp" "$target"
  ok "Merge gereed voor $target"
}

fix_remove_empty(){
  local target="$3"
  info "Verwijder lege messages uit $target"
  jq '
    .messages |= map(select( (.text|length)>0 and (.sentiments|length)>0 ))
  ' "$target" > "${target}.tmp"
  mv "${target}.tmp" "$target"
  ok "Opschoning gereed voor $target"
}

usage(){
  cat <<'USAGE'
Gebruik:
  ./awn_json_tools.sh [PAD] check-all
  ./awn_json_tools.sh [PAD] stats-all
  ./awn_json_tools.sh [PAD] check FILE.json
  ./awn_json_tools.sh [PAD] stats FILE.json
  ./awn_json_tools.sh [PAD] append TARGET.json ADD.json
  ./awn_json_tools.sh [PAD] merge  TARGET.json SRC.json
  ./awn_json_tools.sh [PAD] fix-empty TARGET.json
USAGE
}

main(){
  need_jq
  parse_opts "$@"
  case "$CMD" in
    check-all)   check_all ;;
    stats-all)   stats_all ;;
    check)       check_file "${1:?Geef bestand}" ;;
    stats)       stats_file "${1:?Geef bestand}" ;;
    append)      slurp_append "$AWN_DIR" "${@:1:1}" "${@:2:1}" ;;  # compat: args blijven gelijk
    merge)       slurp_merge  "$AWN_DIR" "${@:1:1}" "${@:2:1}" ;;
    fix-empty)   fix_remove_empty "$AWN_DIR" "${@:1:1}" ;;
    *)           usage; exit 1 ;;
  esac
}

main "$@"

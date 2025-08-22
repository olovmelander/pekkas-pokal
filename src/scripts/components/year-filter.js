class YearMultiSelect {
  constructor(container, { onChange } = {}) {
    this.container = container;
    this.onChange = onChange;
    this.options = [];
    this.selected = new Map();
    this.build();
  }

  build() {
    this.container.classList.add("year-multiselect");

    this.chipContainer = document.createElement("div");
    this.chipContainer.className = "chip-container";

    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "year-search";
    this.input.placeholder = "Sök år...";

    this.dropdown = document.createElement("div");
    this.dropdown.className = "year-options";

    this.container.appendChild(this.chipContainer);
    this.container.appendChild(this.input);
    this.container.appendChild(this.dropdown);

    this.input.addEventListener("input", () => this.renderOptions());
    this.input.addEventListener("focus", () => this.renderOptions());

    document.addEventListener("click", (e) => {
      if (!this.container.contains(e.target)) {
        this.dropdown.style.display = "none";
      }
    });

    this.renderChips();
  }

  setOptions(options = []) {
    this.options = options;
    this.renderOptions();
  }

  renderOptions() {
    const query = this.input.value.toLowerCase();
    this.dropdown.innerHTML = "";
    const filtered = this.options.filter(
      (o) => !this.selected.has(o.id) && String(o.name).toLowerCase().includes(query),
    );

    if (filtered.length === 0) {
      this.dropdown.style.display = "none";
      return;
    }

    filtered.forEach((o) => {
      const opt = document.createElement("div");
      opt.className = "year-option";
      opt.textContent = o.name;
      opt.dataset.id = o.id;
      opt.addEventListener("click", () => {
        this.selected.set(o.id, o.name);
        this.input.value = "";
        this.renderChips();
        this.renderOptions();
        this.triggerChange();
      });
      this.dropdown.appendChild(opt);
    });

    this.dropdown.style.display = "block";
  }

  renderChips() {
    this.chipContainer.innerHTML = "";
    if (this.selected.size === 0) {
      const placeholder = document.createElement("span");
      placeholder.className = "placeholder";
      placeholder.textContent = "Alla År";
      this.chipContainer.appendChild(placeholder);
      return;
    }

    this.selected.forEach((name, id) => {
      const chip = document.createElement("span");
      chip.className = "year-chip";
      chip.textContent = name;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "remove-chip";
      btn.textContent = "×";
      btn.addEventListener("click", () => {
        this.selected.delete(id);
        this.renderChips();
        this.renderOptions();
        this.triggerChange();
      });

      chip.appendChild(btn);
      this.chipContainer.appendChild(chip);
    });
  }

  getSelected() {
    return Array.from(this.selected.keys());
  }

  setSelected(ids = [], silent = false) {
    this.selected.clear();
    ids.forEach((id) => {
      const opt = this.options.find((o) => o.id === id);
      if (opt) this.selected.set(opt.id, opt.name);
    });
    this.renderChips();
    this.renderOptions();
    if (!silent) this.triggerChange();
  }

  triggerChange() {
    if (typeof this.onChange === "function") {
      this.onChange(this.getSelected());
    }
  }
}

window.YearMultiSelect = YearMultiSelect;

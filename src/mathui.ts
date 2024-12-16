import MathEditing from './mathediting';
import MainFormView from './ui/mainformview';
import mathIcon from '../theme/icons/math.svg';
import { Plugin } from 'ckeditor5/src/core';
import { ClickObserver } from 'ckeditor5/src/engine';
import { MathfieldElement } from 'mathlive';
import {
	ButtonView,
	ContextualBalloon,
	clickOutsideHandler
} from 'ckeditor5/src/ui';
import { CKEditorError, global, uid } from 'ckeditor5/src/utils';
import { getBalloonPositionData } from './utils';
import MathCommand from './mathcommand';

const mathKeystroke = 'Ctrl+M';

export default class MathUI extends Plugin {
	public static get requires() {
		return [ ContextualBalloon, MathEditing ] as const;
	}

	public static get pluginName() {
		return 'MathUI' as const;
	}

	private _previewUid = `math-preview-${ uid() }`;
	private _balloon: ContextualBalloon = this.editor.plugins.get( ContextualBalloon );
	public formView: MainFormView | null = null;

	public init(): void {
		const editor = this.editor;
		editor.editing.view.addObserver( ClickObserver );

		this._createToolbarMathButton();

		this.formView = this._createFormView();

		this._enableUserBalloonInteractions();
	}

	public override destroy(): void {
		super.destroy();

		this.formView?.destroy();

		// Destroy preview element
		const previewEl = global.document.getElementById( this._previewUid );
		if ( previewEl ) {
			previewEl.parentNode?.removeChild( previewEl );
		}
	}

	public _showUI(): void {
		const editor = this.editor;
		const mathCommand = editor.commands.get( 'math' );

		if ( !mathCommand?.isEnabled ) {
			return;
		}

		this._addFormView();

		this._balloon.showStack( 'main' );
	}

	private _createFormView() {
		const editor = this.editor;
		const mathCommand = editor.commands.get( 'math' );
		if ( !( mathCommand instanceof MathCommand ) ) {
			/**
			 * Missing Math command
			 * @error math-command
			 */
			throw new CKEditorError( 'math-command' );
		}

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const mathConfig = editor.config.get( 'math' )!;

		const formView = new MainFormView(
			editor.locale,
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			mathConfig.engine!,
			mathConfig.lazyLoad,
			mathConfig.enablePreview,
			this._previewUid,
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			mathConfig.previewClassName!,
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			mathConfig.popupClassName!,
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			mathConfig.katexRenderOptions!
		);

		formView.mathInputView.bind( 'value' ).to( mathCommand, 'value' );
		formView.displayButtonView.bind( 'isOn' ).to( mathCommand, 'display' );

		// Form elements should be read-only when corresponding commands are disabled.
		formView.mathInputView.bind( 'isReadOnly' ).to( mathCommand, 'isEnabled', value => !value );
		formView.saveButtonView.bind( 'isEnabled' ).to( mathCommand );
		formView.displayButtonView.bind( 'isEnabled' ).to( mathCommand );

		// Listen to submit button click
		this.listenTo( formView, 'submit', () => {
			editor.execute( 'math', formView.equation, formView.displayButtonView.isOn, mathConfig.outputType, mathConfig.forceOutputType );
			this._closeFormView();
		} );

		// Listen to cancel button click
		this.listenTo( formView, 'cancel', () => {
			this._closeFormView();
		} );

		this.listenTo( formView, 'mathlive', () => {
			this._showMathLiveForm();
		} );

		// Close plugin ui, if esc is pressed (while ui is focused)
		formView.keystrokes.set( 'esc', ( _data, cancel ) => {
			this._closeFormView();
			cancel();
		} );

		return formView;
	}

	private _addFormView() {
		if ( this._isFormInPanel ) {
			return;
		}

		const editor = this.editor;
		const mathCommand = editor.commands.get( 'math' );
		if ( !( mathCommand instanceof MathCommand ) ) {
			/**
			* Math command not found
			* @error plugin-load
					*/
			throw new CKEditorError( 'plugin-load', { pluginName: 'math' } );
		}

		if ( this.formView == null ) {
			return;
		}

		this._balloon.add( {
			view: this.formView,
			position: getBalloonPositionData( editor )
		} );

		if ( this._balloon.visibleView === this.formView ) {
			this.formView.mathInputView.fieldView.element?.select();
		}

		// Show preview element
		const previewEl = global.document.getElementById( this._previewUid );
		if ( previewEl && this.formView.previewEnabled ) {
			// Force refresh preview
			this.formView.mathView?.updateMath();
		}

		this.formView.equation = mathCommand.value ?? '';
		this.formView.displayButtonView.isOn = mathCommand.display || false;
	}

	/**
	 * @private
	 */
	public _hideUI(): void {
		if ( !this._isFormInPanel ) {
			return;
		}

		const editor = this.editor;

		this.stopListening( editor.ui, 'update' );
		this.stopListening( this._balloon, 'change:visibleView' );

		editor.editing.view.focus();

		// Remove form first because it's on top of the stack.
		this._removeFormView();
	}

	private _showMathLiveForm() {
		try {
			const editor = this.editor;
			const mathLiveEditor = new MathfieldElement();
			mathLiveEditor.style.width = '550px';

			const dialog = document.createElement( 'div' );
			dialog.id = 'did';
			dialog.style.position = 'fixed';
			dialog.style.top = '30%';
			dialog.style.left = '50%';
			dialog.style.transform = 'translate(-50%, -50%)';
			dialog.style.backgroundColor = '#f9f9f9';
			dialog.style.padding = '20px';
			dialog.style.border = '1px solid #ddd';
			dialog.style.borderRadius = '8px';
			dialog.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
			dialog.style.fontFamily = 'Arial, sans-serif';
			dialog.style.fontSize = '16px';
			dialog.style.zIndex = '3000';
			dialog.style.width = '550px';

			dialog.appendChild( mathLiveEditor );
			mathLiveEditor.setValue( this.formView?.equation );

			const cancelButton = document.createElement( 'button' );
			cancelButton.textContent = 'Cancel';
			cancelButton.style.margin = '16px';
			cancelButton.style.padding = '10px 20px';
			cancelButton.style.backgroundColor = '#f44336';
			cancelButton.style.color = '#fff';
			cancelButton.style.border = 'none';
			cancelButton.style.borderRadius = '5px';
			cancelButton.style.cursor = 'pointer';
			cancelButton.style.fontFamily = 'Arial, sans-serif';
			cancelButton.style.fontSize = '16px';
			cancelButton.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
			cancelButton.style.transition = 'background-color 0.3s, transform 0.2s';

			cancelButton.addEventListener( 'mouseover', () => {
				cancelButton.style.backgroundColor = '#d32f2f';
				cancelButton.style.transform = 'scale(1.05)';
			} );

			cancelButton.addEventListener( 'mouseout', () => {
				cancelButton.style.backgroundColor = '#f44336';
				cancelButton.style.transform = 'scale(1)';
			} );

			cancelButton.onclick = () => {
				this._removeDialogue();
			}

			const insertButton = document.createElement( 'button' );
			insertButton.textContent = 'Insert Equation';
			insertButton.style.margin = '16px';
			insertButton.style.padding = '10px 20px';
			insertButton.style.backgroundColor = '#007BFF';
			insertButton.style.color = '#fff';
			insertButton.style.border = 'none';
			insertButton.style.borderRadius = '5px';
			insertButton.style.cursor = 'pointer';
			insertButton.style.fontFamily = 'Arial, sans-serif';
			insertButton.style.fontSize = '16px';
			insertButton.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
			insertButton.style.transition = 'background-color 0.3s, transform 0.2s';

			insertButton.addEventListener( 'mouseover', () => {
				insertButton.style.backgroundColor = '#0056b3';
				insertButton.style.transform = 'scale(1.05)';
			} );

			insertButton.addEventListener( 'mouseout', () => {
				insertButton.style.backgroundColor = '#007BFF';
				insertButton.style.transform = 'scale(1)';
			} );

			insertButton.onclick = () => {
				const mathExpression = mathLiveEditor.getValue();
				if ( mathExpression ) {
					editor.execute( 'math', mathExpression );
				}
				this._removeDialogue();
			};

			dialog.appendChild( insertButton );
			dialog.appendChild( cancelButton );

			document.body.appendChild( dialog );
		} catch ( error ) {
			console.error( 'Error during math editor insertion:', error );
		}
	}

	private _closeFormView() {
		const mathCommand = this.editor.commands.get( 'math' );
		if ( mathCommand?.value != null ) {
			this._removeFormView();
			this._removeDialogue();
		} else {
			this._hideUI();
		}
	}

	private _removeFormView() {
		if ( this._isFormInPanel && this.formView ) {
			this.formView.saveButtonView.focus();

			this._balloon.remove( this.formView );

			// Hide preview element
			const previewEl = global.document.getElementById( this._previewUid );
			if ( previewEl ) {
				previewEl.style.visibility = 'hidden';
			}

			this.editor.editing.view.focus();
		}
	}

	private _removeDialogue() {
		const dialog = document.getElementById( 'did' );
		if ( dialog ) {
			dialog.remove();
		}
	}

	private _createToolbarMathButton() {
		const editor = this.editor;
		const mathCommand = editor.commands.get( 'math' );
		if ( !mathCommand ) {
			/**
			* Math command not found
			* @error plugin-load
					*/
			throw new CKEditorError( 'plugin-load', { pluginName: 'math' } );
		}
		const t = editor.t;

		// Handle the `Ctrl+M` keystroke and show the panel.
		editor.keystrokes.set( mathKeystroke, ( _keyEvtData, cancel ) => {
			// Prevent focusing the search bar in FF and opening new tab in Edge. #153, #154.
			cancel();

			if ( mathCommand.isEnabled ) {
				this._showUI();
			}
		} );

		this.editor.ui.componentFactory.add( 'math', locale => {
			const button = new ButtonView( locale );

			button.isEnabled = true;
			button.label = t( 'Insert math' );
			button.icon = mathIcon;
			button.keystroke = mathKeystroke;
			button.tooltip = true;
			button.isToggleable = true;

			button.bind( 'isEnabled' ).to( mathCommand, 'isEnabled' );

			this.listenTo( button, 'execute', () => {
				this._showUI();
			} );

			return button;
		} );
	}

	private _enableUserBalloonInteractions() {
		const editor = this.editor;
		const viewDocument = this.editor.editing.view.document;
		this.listenTo( viewDocument, 'click', () => {
			const mathCommand = editor.commands.get( 'math' );
			if ( mathCommand?.isEnabled && mathCommand.value ) {
				this._showUI();
			}
		} );

		// Close the panel on the Esc key press when the editable has focus and the balloon is visible.
		editor.keystrokes.set( 'Esc', ( _data, cancel ) => {
			if ( this._isUIVisible ) {
				this._hideUI();
				cancel();
			}
		} );

		// Close on click outside of balloon panel element.
		if ( this.formView ) {
			clickOutsideHandler( {
				emitter: this.formView,
				activator: () => !!this._isFormInPanel,
				contextElements: this._balloon.view.element ? [ this._balloon.view.element ] : [],
				callback: () => { this._hideUI(); }
			} );
		} else {
			throw new Error( 'missing form view' );
		}
	}

	private get _isUIVisible() {
		const visibleView = this._balloon.visibleView;

		return visibleView == this.formView;
	}

	private get _isFormInPanel() {
		return this.formView && this._balloon.hasView( this.formView );
	}
}
